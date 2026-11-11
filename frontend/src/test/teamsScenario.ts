import type { Me } from '@/api/types';
import { makeAdminMe, makeMe, makePublicSnapshot, makeTeams } from './factories';
import { createTestFakes, createTestServices, type TestFakes } from './testServices';
import type { AppServices } from '@/app/AppServices';

export interface TeamsScenarioOptions {
  viewer?: 'player' | 'admin';
  teamCount?: number;
  membersPerTeam?: number;
}

export interface TeamsScenario {
  fakes: TestFakes;
  services: AppServices;
  me: Me;
}

/**
 * A signed-in viewer and loaded teams, as the teams screen and its dialogs need them. Real names follow the server's
 * rule: an admin gets every member's, a player only their own (the player is the first member of the first team).
 * Players are numbered from 1; the admin is 1000, on no team.
 */
export async function createTeamsScenario({
  viewer = 'player',
  teamCount = 3,
  membersPerTeam = 2,
}: TeamsScenarioOptions = {}): Promise<TeamsScenario> {
  const me = viewer === 'admin' ? makeAdminMe({ playerId: 1000, displayName: 'Host' }) : makeMe({ playerId: 1 });
  const fakes = createTestFakes();
  fakes.teamsApi.teams = makeTeams(teamCount, { membersPerTeam }).map((team) => ({
    ...team,
    members: team.members.map((member) => ({
      ...member,
      realName: viewer === 'admin' || member.playerId === me.playerId ? `Real Name ${member.playerId}` : null,
    })),
  }));
  fakes.sessionApi.me = me;
  fakes.playersApi.myPlayerId = me.playerId;
  const services = createTestServices({}, fakes);
  await services.session.restore();
  // The "Add team" dialog asks the event which theme pack's colours and icons to offer.
  await services.event.load();
  await services.teams.teams.load();
  return { fakes, services, me };
}

/** Puts the round in play, so the dialogs show their "a round is running" note. */
export function startRound(fakes: TestFakes): void {
  fakes.connection.setState('connected');
  fakes.connection.emitRoundUpdated(makePublicSnapshot({ version: 1, roundId: 'round-1', phase: 'open' }));
}
