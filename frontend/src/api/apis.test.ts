import { describe, expect, it } from 'vitest';
import { ApiClient } from './ApiClient';
import { HttpArchiveApi } from './ArchiveApi';
import { HttpEventApi } from './EventApi';
import { HttpPlayersApi } from './PlayersApi';
import { HttpScoresApi } from './ScoresApi';
import { HttpSessionApi } from './SessionApi';
import { HttpTeamsApi } from './TeamsApi';

interface SentRequest {
  method: string;
  url: string;
  body: unknown;
}

// Every API class against MSW's default handlers, with the requests it sent recorded: one row per route in
// Appendix A. A wrong method, path or body shows up here, and so does a reply the types don't match.
function createApis() {
  const sent: SentRequest[] = [];
  const client = new ApiClient(async (input, init) => {
    sent.push({ method: init?.method ?? 'GET', url: input, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return fetch(input, init);
  }, () => {});
  return {
    sent,
    event: new HttpEventApi(client),
    session: new HttpSessionApi(client),
    teams: new HttpTeamsApi(client),
    players: new HttpPlayersApi(client),
    scores: new HttpScoresApi(client),
    archive: new HttpArchiveApi(client),
  };
}

describe('the API classes', () => {
  it('EventApi calls the event routes', async () => {
    const { sent, event } = createApis();

    const info = await event.getEvent();
    const teams = await event.getJoinTeams('AB12');

    expect(info.themeKey).toBe('default');
    expect(teams).toHaveLength(3);
    expect(sent).toEqual([
      { method: 'GET', url: '/api/event', body: undefined },
      { method: 'GET', url: '/api/event/teams?code=AB12', body: undefined },
    ]);
  });

  it('SessionApi calls the session routes', async () => {
    const { sent, session } = createApis();
    const registration = { joinCode: 'AB12', realName: 'Real Name', displayName: 'Nick', pin: '1234', teamId: 2 };
    const credentials = { joinCode: 'AB12', realName: 'Real Name', pin: '1234' };

    const registered = await session.register(registration);
    const signedIn = await session.signIn(credentials);
    await session.signOut();
    const me = await session.getMe();

    expect([registered.playerId, signedIn.playerId, me.playerId]).toEqual([1, 1, 1]);
    expect(sent).toEqual([
      { method: 'POST', url: '/api/session/register', body: registration },
      { method: 'POST', url: '/api/session/signin', body: credentials },
      { method: 'POST', url: '/api/session/signout', body: undefined },
      { method: 'GET', url: '/api/session/me', body: undefined },
    ]);
  });

  it('TeamsApi calls the team routes', async () => {
    const { sent, teams } = createApis();

    const all = await teams.getTeams();
    const created = await teams.createTeam({ name: 'New', colorKey: 'c', iconKey: 'i' });
    const renamed = await teams.renameTeam(2, 'Renamed');
    await teams.deleteTeam(2);

    expect(all).toHaveLength(3);
    expect(created).toMatchObject({ id: 4, name: 'New' });
    expect(renamed).toMatchObject({ id: 2, name: 'Renamed' });
    expect(sent).toEqual([
      { method: 'GET', url: '/api/teams', body: undefined },
      { method: 'POST', url: '/api/teams', body: { name: 'New', colorKey: 'c', iconKey: 'i' } },
      { method: 'PATCH', url: '/api/teams/2', body: { name: 'Renamed' } },
      { method: 'DELETE', url: '/api/teams/2', body: undefined },
    ]);
  });

  it('PlayersApi calls the player routes', async () => {
    const { sent, players } = createApis();

    await players.getPlayers();
    await players.updateMyNames({ displayName: 'Nick' });
    await players.updatePlayerNames(5, { realName: 'Real', displayName: null });
    const moved = await players.movePlayer(5, 2);
    const promoted = await players.promotePlayer(5);

    expect(moved.id).toBe(5);
    expect(promoted).toMatchObject({ id: 5, role: 'admin', teamId: null });
    expect(sent).toEqual([
      { method: 'GET', url: '/api/players', body: undefined },
      { method: 'PATCH', url: '/api/players/me', body: { displayName: 'Nick' } },
      { method: 'PATCH', url: '/api/players/5', body: { realName: 'Real', displayName: null } },
      { method: 'PATCH', url: '/api/players/5/team', body: { teamId: 2 } },
      { method: 'POST', url: '/api/players/5/promote', body: undefined },
    ]);
  });

  it('ScoresApi calls the score routes', async () => {
    const { sent, scores } = createApis();
    const request = { target: 'team', targetId: 2, amount: 5, multiplier: 2, direction: 'add', reason: 'Bonus' } as const;

    await scores.getTeamScores();
    await scores.getPlayerScores();
    await scores.getAdjustments();
    await scores.getAdjustments(20);
    const adjustment = await scores.adjust(request);
    const undo = await scores.reverse(7);

    expect(adjustment.targetId).toBe(2);
    expect(undo.reversesAdjustmentId).toBe(7);
    expect(sent).toEqual([
      { method: 'GET', url: '/api/scores/teams', body: undefined },
      { method: 'GET', url: '/api/scores/players', body: undefined },
      { method: 'GET', url: '/api/scores/adjustments', body: undefined },
      { method: 'GET', url: '/api/scores/adjustments?take=20', body: undefined },
      { method: 'POST', url: '/api/scores/adjustments', body: request },
      { method: 'POST', url: '/api/scores/adjustments/7/reverse', body: undefined },
    ]);
  });

  it('ArchiveApi calls the archive routes', async () => {
    const { sent, archive } = createApis();

    const finalized = await archive.finalize();
    const file = await archive.exportArchive(finalized.eventId);

    expect(file.fileName).toBe('buzzer-archive-2030.json');
    expect(sent).toEqual([
      { method: 'POST', url: '/api/archive/finalize', body: undefined },
      { method: 'GET', url: '/api/archive/1/export', body: undefined },
    ]);
  });
});
