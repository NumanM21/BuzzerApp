import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { Team } from '@/api/types';
import { deferred } from '@/test/deferred';
import { flushPromises } from '@/test/flushPromises';
import { makeAdminMe, makeMe, makePlayers, makeTeams } from '@/test/factories';
import { createTestFakes } from '@/test/testServices';
import { ScoresStore } from './ScoresStore';
import { SessionStore } from './SessionStore';
import { TeamsStore } from './TeamsStore';

async function setup(me = makeAdminMe()) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  const session = new SessionStore(fakes.sessionApi);
  await session.restore();
  const scores = new ScoresStore(fakes.scoresApi, session, fakes.events);
  const store = new TeamsStore(fakes.teamsApi, fakes.playersApi, session, scores, fakes.events);
  return { fakes, session, scores, store };
}

describe('TeamsStore', () => {
  it.each([0, 1, 2, 6, 13])('shows %i teams in the order the server sent them', async (count) => {
    const { fakes, store } = await setup();
    // Reversed on purpose: the store must not sort, whatever the order of ids or names.
    const teams: Team[] = makeTeams(count, { membersPerTeam: 2 }).reverse();
    fakes.teamsApi.teams = teams;

    await store.teams.load();

    expect(store.teams.value?.map((team) => team.id)).toEqual(teams.map((team) => team.id));
  });

  it('keeps the old teams while a reload runs', async () => {
    const { fakes, store } = await setup();
    await store.teams.load();
    const before = store.teams.value;
    const slow = deferred<Team[]>();
    fakes.teamsApi.getTeams = () => slow.promise;

    const reload = store.teams.load();

    expect(store.teams.value).toBe(before);
    slow.resolve(makeTeams(1));
    await reload;
    expect(store.teams.value).toHaveLength(1);
  });

  describe('every write reloads what it touched, at once', () => {
    const writes: [string, (store: TeamsStore) => Promise<unknown>, string][] = [
      ['createTeam', (store) => store.createTeam({ name: 'New', colorKey: 'c', iconKey: 'i' }), 'createTeam'],
      ['renameTeam', (store) => store.renameTeam(1, 'Renamed'), 'renameTeam'],
      ['editNames', (store) => store.editNames(2, { displayName: 'Nick' }), 'updatePlayerNames'],
      ['editOwnNames', (store) => store.editOwnNames({ displayName: 'Mine' }), 'updateMyNames'],
      ['movePlayer', (store) => store.movePlayer(2, 3), 'movePlayer'],
      ['promote', (store) => store.promote(2), 'promotePlayer'],
    ];

    it.each(writes)('%s reloads the teams and the scores on screen', async (_name, write, apiCall) => {
      const { fakes, store, scores } = await setup();
      await store.teams.ensureLoaded();
      await scores.teamScores.ensureLoaded();
      const apiCalls = () => [...fakes.teamsApi.calls, ...fakes.playersApi.calls];

      await write(store);

      expect(apiCalls()).toContain(apiCall);
      expect(fakes.teamsApi.calls.filter((call) => call === 'getTeams')).toHaveLength(2);
      expect(fakes.scoresApi.calls.filter((call) => call === 'getTeamScores')).toHaveLength(2);
    });

    it('deleteTeam reloads the same way', async () => {
      const { fakes, store, scores } = await setup();
      fakes.teamsApi.teams = makeTeams(3);
      await store.teams.ensureLoaded();
      await scores.teamScores.ensureLoaded();

      await store.deleteTeam(3);

      expect(store.teams.value?.map((team) => team.id)).toEqual([1, 2]);
      expect(fakes.scoresApi.calls.filter((call) => call === 'getTeamScores')).toHaveLength(2);
    });

    it('does not load what nobody asked for', async () => {
      const { fakes, store } = await setup();

      await store.renameTeam(1, 'Renamed');

      expect(fakes.teamsApi.calls).toEqual(['renameTeam']);
      expect(fakes.scoresApi.calls).toEqual([]);
    });

    it('shows the new data as soon as the write resolves', async () => {
      const { store } = await setup();
      await store.teams.ensureLoaded();

      await store.renameTeam(2, 'Renamed');

      expect(store.teams.value?.find((team) => team.id === 2)?.name).toBe('Renamed');
    });
  });

  describe('the caller\'s own session', () => {
    it('editOwnNames refreshes it, so the new name shows everywhere', async () => {
      const { fakes, session, store } = await setup(makeMe({ playerId: 1, displayName: 'Old' }));
      fakes.sessionApi.me = makeMe({ playerId: 1, displayName: 'Mine' });

      await store.editOwnNames({ displayName: 'Mine' });

      expect(session.me?.displayName).toBe('Mine');
    });

    it('editNames of another player leaves it alone', async () => {
      const { fakes, store } = await setup(makeAdminMe({ playerId: 50 }));
      fakes.sessionApi.clearCalls();

      await store.editNames(2, { displayName: 'Nick' });

      expect(fakes.sessionApi.calls).toEqual([]);
    });

    it('editNames of the caller refreshes it', async () => {
      const { fakes, store } = await setup(makeAdminMe({ playerId: 50, displayName: 'Host' }));
      fakes.sessionApi.me = makeAdminMe({ playerId: 50, displayName: 'Boss' });
      fakes.playersApi.players = makePlayers(50);

      await store.editNames(50, { displayName: 'Boss' });

      expect(fakes.sessionApi.calls.at(-1)).toBe('getMe');
    });

    it('a failed refresh does not fail the write that already succeeded', async () => {
      const { fakes, store } = await setup(makeMe({ playerId: 1 }));
      fakes.sessionApi.failNext(ApiError.network());

      await expect(store.editOwnNames({ displayName: 'Mine' })).resolves.toMatchObject({ displayName: 'Mine' });
    });
  });

  describe('errors', () => {
    it('reach the caller, and nothing is reloaded', async () => {
      const { fakes, store } = await setup();
      await store.teams.ensureLoaded();
      const conflict = new ApiError({ status: 409, kind: 'conflict', detail: 'That name is in use.' });
      fakes.teamsApi.failNext(conflict);

      await expect(store.renameTeam(1, 'Taken')).rejects.toBe(conflict);

      expect(fakes.teamsApi.calls).toEqual(['getTeams', 'renameTeam']);
    });

    it('include the server\'s refusal to delete a team that has players', async () => {
      const { store } = await setup();

      await expect(store.deleteTeam(1)).rejects.toMatchObject({ kind: 'conflict' });
    });

    it('from a player write reach the caller too', async () => {
      const { fakes, store } = await setup();
      const refusal = new ApiError({ status: 400, kind: 'validation', fieldErrors: { teamId: ['Unknown team.'] } });
      fakes.playersApi.failNext(refusal);

      await expect(store.movePlayer(2, 99)).rejects.toBe(refusal);
    });
  });

  describe('when the hub says teams changed', () => {
    it('reloads the teams that were loaded, and refreshes the session (the caller may have been moved)', async () => {
      const { fakes, store } = await setup(makeMe());
      await store.teams.ensureLoaded();
      fakes.sessionApi.clearCalls();

      fakes.events.emitTeamsChanged();
      await flushPromises();

      expect(fakes.teamsApi.calls).toEqual(['getTeams', 'getTeams']);
      expect(fakes.sessionApi.calls).toEqual(['getMe']);
    });

    it('reloads the scores on screen too, since team names are on them', async () => {
      const { fakes, scores } = await setup();
      await scores.teamScores.ensureLoaded();

      fakes.events.emitTeamsChanged();
      await flushPromises();

      expect(fakes.scoresApi.calls).toEqual(['getTeamScores', 'getTeamScores']);
    });

    it('does not load teams nobody asked for', async () => {
      const { fakes } = await setup();

      fakes.events.emitTeamsChanged();
      await flushPromises();

      expect(fakes.teamsApi.calls).toEqual([]);
    });

    it('does the same after the connection came back', async () => {
      const { fakes, store } = await setup();
      await store.teams.ensureLoaded();

      fakes.events.emitReconnected();
      await flushPromises();

      expect(fakes.teamsApi.calls).toEqual(['getTeams', 'getTeams']);
    });

    it('leaves the session alone when nobody is signed in', async () => {
      const { fakes, session } = await setup();
      await session.signOut();
      fakes.sessionApi.clearCalls();

      fakes.events.emitTeamsChanged();
      await flushPromises();

      expect(fakes.sessionApi.calls).toEqual([]);
    });
  });

  describe('when someone else signs in on the same phone', () => {
    it('forgets the teams, which may carry the last person\'s real name', async () => {
      const { session, store } = await setup();
      await store.teams.ensureLoaded();

      await session.signOut();

      expect(store.teams.status).toBe('idle');
      expect(store.teams.value).toBeUndefined();
    });
  });
});
