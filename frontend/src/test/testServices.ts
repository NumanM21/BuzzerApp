import type { AppServices } from '@/app/AppServices';
import { EventStore } from '@/stores/EventStore';
import { ScoresStore } from '@/stores/ScoresStore';
import { SessionStore } from '@/stores/SessionStore';
import { TeamsStore } from '@/stores/TeamsStore';
import { FakeArchiveApi } from './fakes/FakeArchiveApi';
import { FakeEventApi } from './fakes/FakeEventApi';
import { FakeGameEvents } from './fakes/FakeGameEvents';
import { FakePlayersApi } from './fakes/FakePlayersApi';
import { FakeScoresApi } from './fakes/FakeScoresApi';
import { FakeSessionApi } from './fakes/FakeSessionApi';
import { FakeTeamsApi } from './fakes/FakeTeamsApi';
import { FakeThemeCatalog, makePackKeys } from './fakes/FakeThemeCatalog';

/** One in-memory fake per service, so a test can read what was called and change what the server "has". */
export interface TestFakes {
  eventApi: FakeEventApi;
  sessionApi: FakeSessionApi;
  teamsApi: FakeTeamsApi;
  playersApi: FakePlayersApi;
  scoresApi: FakeScoresApi;
  archiveApi: FakeArchiveApi;
  events: FakeGameEvents;
}

export function createTestFakes(): TestFakes {
  return {
    eventApi: new FakeEventApi(),
    sessionApi: new FakeSessionApi(),
    teamsApi: new FakeTeamsApi(),
    playersApi: new FakePlayersApi(),
    scoresApi: new FakeScoresApi(),
    archiveApi: new FakeArchiveApi(),
    events: new FakeGameEvents(),
  };
}

/**
 * `AppServices` with the real stores over fakes (the stores are the code under test; the network is not), and any
 * piece replaced by the test. Pass the same `fakes` the test holds to read calls or change the "server".
 */
export function createTestServices(
  overrides: Partial<AppServices> = {},
  fakes: TestFakes = createTestFakes(),
): AppServices {
  const session = new SessionStore(fakes.sessionApi);
  const scores = new ScoresStore(fakes.scoresApi, session, fakes.events);
  const teams = new TeamsStore(fakes.teamsApi, fakes.playersApi, session, scores, fakes.events);
  return {
    themes: new FakeThemeCatalog({ default: makePackKeys(3, 2) }),
    event: new EventStore(fakes.eventApi),
    session,
    teams,
    scores,
    eventApi: fakes.eventApi,
    archive: fakes.archiveApi,
    ...overrides,
  };
}
