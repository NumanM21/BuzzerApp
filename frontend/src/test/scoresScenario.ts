import type { AppServices } from '@/app/AppServices';
import type { Me } from '@/api/types';
import { makeAdjustments, makeAdminMe, makeMe, makePlayerScores, makeTeamScores, makeTeams } from './factories';
import { createTestFakes, createTestServices, type TestFakes } from './testServices';

export interface ScoresScenarioOptions {
  viewer?: 'player' | 'admin';
  teamCount?: number;
  playerCount?: number;
  adjustmentCount?: number;
}

export interface ScoresScenario {
  fakes: TestFakes;
  services: AppServices;
  me: Me;
}

/**
 * A signed-in viewer and a server with teams, scores and adjustments, for the two score screens. Nothing is loaded
 * yet: the view model under test loads what it needs, so its `activate()` is part of what is tested. Players are
 * spread over the teams in turn (`Player 1` on `Team 1`, …); the admin is 1000, on no team.
 */
export async function createScoresScenario({
  viewer = 'admin',
  teamCount = 3,
  playerCount = 6,
  adjustmentCount = 3,
}: ScoresScenarioOptions = {}): Promise<ScoresScenario> {
  const me = viewer === 'admin' ? makeAdminMe({ playerId: 1000, displayName: 'Host' }) : makeMe({ playerId: 1 });
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  fakes.teamsApi.teams = makeTeams(teamCount);
  fakes.scoresApi.teamScores = makeTeamScores(teamCount);
  fakes.scoresApi.playerScores = makePlayerScores(playerCount, teamCount);
  fakes.scoresApi.adjustments = makeAdjustments(adjustmentCount);
  const services = createTestServices({}, fakes);
  await services.session.restore();
  return { fakes, services, me };
}
