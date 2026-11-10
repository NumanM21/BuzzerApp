import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { TeamScore } from '@/api/types';
import { deferred } from '@/test/deferred';
import { flushPromises } from '@/test/flushPromises';
import { makeAdminMe, makeMe, makeTeamScores } from '@/test/factories';
import { createTestFakes } from '@/test/testServices';
import { ScoresStore } from './ScoresStore';
import { SessionStore } from './SessionStore';

async function setup(me = makeAdminMe()) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  const session = new SessionStore(fakes.sessionApi);
  await session.restore();
  const store = new ScoresStore(fakes.scoresApi, session, fakes.events);
  return { fakes, session, store };
}

describe('ScoresStore', () => {
  it.each([1, 2, 6, 13])('shows %i team scores in the order the server sent them', async (count) => {
    const { fakes, store } = await setup();
    // Equal totals share a rank; the server's order (not a sort by name or id) is the order shown.
    const scores: TeamScore[] = makeTeamScores(count, 0).reverse();
    fakes.scoresApi.teamScores = scores;

    await store.teamScores.load();

    expect(store.teamScores.value?.map((score) => score.teamId)).toEqual(scores.map((score) => score.teamId));
  });

  it('loads each list on its own', async () => {
    const { fakes, store } = await setup();

    await store.teamScores.ensureLoaded();

    expect(fakes.scoresApi.calls).toEqual(['getTeamScores']);
  });

  it('keeps the old team scores while a reload runs', async () => {
    const { fakes, store } = await setup();
    await store.teamScores.load();
    const before = store.teamScores.value;
    const slow = deferred<TeamScore[]>();
    fakes.scoresApi.getTeamScores = () => slow.promise;

    const reload = store.teamScores.load();

    expect(store.teamScores.value).toBe(before);
    slow.resolve(makeTeamScores(2));
    await reload;
    expect(store.teamScores.value).toHaveLength(2);
  });

  describe('ensureAdminDataLoaded', () => {
    it('loads the player scores and the recent adjustments for an admin', async () => {
      const { fakes, store } = await setup(makeAdminMe());

      await store.ensureAdminDataLoaded();

      expect(fakes.scoresApi.calls).toEqual(expect.arrayContaining(['getPlayerScores', 'getAdjustments']));
      expect(store.playerScores.value).toEqual(fakes.scoresApi.playerScores);
      expect(store.recentAdjustments.value).toEqual(fakes.scoresApi.adjustments);
    });

    it('asks for nothing when the person is not an admin (the server would answer 403)', async () => {
      const { fakes, store } = await setup(makeMe());

      await store.ensureAdminDataLoaded();

      expect(fakes.scoresApi.calls).toEqual([]);
    });
  });

  describe('when the hub says scores changed', () => {
    it('reloads only the lists that were already loaded', async () => {
      const { fakes, store } = await setup();
      await store.teamScores.ensureLoaded();

      fakes.events.emitScoresChanged();
      await flushPromises();

      expect(fakes.scoresApi.calls).toEqual(['getTeamScores', 'getTeamScores']);
    });

    it('does nothing when nothing was loaded', async () => {
      const { fakes } = await setup();

      fakes.events.emitScoresChanged();
      await flushPromises();

      expect(fakes.scoresApi.calls).toEqual([]);
    });

    it('also reloads after the connection came back', async () => {
      const { fakes, store } = await setup();
      await store.teamScores.ensureLoaded();
      await store.ensureAdminDataLoaded();
      const callsBefore = fakes.scoresApi.calls.length;

      fakes.events.emitReconnected();
      await flushPromises();

      expect(fakes.scoresApi.calls.length - callsBefore).toBe(3);
    });
  });

  describe('adjust and reverse', () => {
    it('adjust calls the server, then reloads what is loaded, without waiting for the hub', async () => {
      const { fakes, store } = await setup();
      await store.teamScores.ensureLoaded();
      await store.ensureAdminDataLoaded();
      fakes.scoresApi.clearCalls();

      const adjustment = await store.adjust({
        target: 'team',
        targetId: 2,
        amount: 5,
        multiplier: 2,
        direction: 'add',
      });

      expect(adjustment.amount).toBe(10);
      expect(fakes.scoresApi.calls[0]).toBe('adjust');
      expect(fakes.scoresApi.calls.slice(1).sort()).toEqual(['getAdjustments', 'getPlayerScores', 'getTeamScores']);
      expect(store.recentAdjustments.value?.[0]).toEqual(adjustment);
    });

    it('adjust does not load a list nobody asked for', async () => {
      const { fakes, store } = await setup();

      await store.adjust({ target: 'player', targetId: 1, amount: 1, multiplier: 1, direction: 'remove' });

      expect(fakes.scoresApi.calls).toEqual(['adjust']);
    });

    it('reverse answers with the undo row and reloads the adjustments', async () => {
      const { fakes, store } = await setup();
      await store.ensureAdminDataLoaded();
      const target = fakes.scoresApi.adjustments[0];

      const undo = await store.reverse(target.id);

      expect(undo.reversesAdjustmentId).toBe(target.id);
      expect(store.recentAdjustments.value?.find((row) => row.id === target.id)?.isReversed).toBe(true);
    });

    it('lets the error reach the caller and does not reload', async () => {
      const { fakes, store } = await setup();
      await store.teamScores.ensureLoaded();
      const conflict = new ApiError({ status: 409, kind: 'conflict', detail: 'Already undone.' });
      fakes.scoresApi.failNext(conflict);

      await expect(store.reverse(1)).rejects.toBe(conflict);

      expect(fakes.scoresApi.calls).toEqual(['getTeamScores', 'reverse']);
    });
  });

  describe('when someone else signs in on the same phone', () => {
    it('forgets everything that was loaded', async () => {
      const { fakes, session, store } = await setup();
      await store.teamScores.ensureLoaded();
      await store.ensureAdminDataLoaded();

      await session.signOut();

      expect(store.teamScores.status).toBe('idle');
      expect(store.playerScores.value).toBeUndefined();
      expect(store.recentAdjustments.value).toBeUndefined();
      fakes.events.emitScoresChanged();
      await flushPromises();
      expect(fakes.scoresApi.calls.filter((call) => call === 'getTeamScores')).toHaveLength(1);
    });
  });
});
