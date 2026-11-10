import type { AppServices } from '@/app/AppServices';
import { EventStore } from '@/stores/EventStore';
import { RoundStore } from '@/stores/RoundStore';
import { ScoresStore } from '@/stores/ScoresStore';
import { ServerClock } from '@/stores/ServerClock';
import { SessionStore } from '@/stores/SessionStore';
import { TeamsStore } from '@/stores/TeamsStore';
import { FakeArchiveApi } from './fakes/FakeArchiveApi';
import { FakeEventApi } from './fakes/FakeEventApi';
import { FakeGameConnection } from './fakes/FakeGameConnection';
import type { FakeGameEvents } from './fakes/FakeGameEvents';
import { FakeJoinCodeMemory } from './fakes/FakeJoinCodeMemory';
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
  /** The same object as `connection`, typed for the stores that only listen for "data changed". */
  events: FakeGameEvents;
  connection: FakeGameConnection;
  joinCodeMemory: FakeJoinCodeMemory;
}

export function createTestFakes(): TestFakes {
  const connection = new FakeGameConnection();
  return {
    eventApi: new FakeEventApi(),
    sessionApi: new FakeSessionApi(),
    teamsApi: new FakeTeamsApi(),
    playersApi: new FakePlayersApi(),
    scoresApi: new FakeScoresApi(),
    archiveApi: new FakeArchiveApi(),
    events: connection,
    connection,
    joinCodeMemory: new FakeJoinCodeMemory(),
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
  // The phone's clock is `Date.now()`, which `vi.useFakeTimers()` controls.
  const clock = new ServerClock();
  return {
    themes: new FakeThemeCatalog({ default: makePackKeys(3, 2) }),
    event: new EventStore(fakes.eventApi),
    session,
    teams,
    scores,
    round: new RoundStore(fakes.connection, clock),
    clock,
    eventApi: fakes.eventApi,
    archive: fakes.archiveApi,
    joinCodeMemory: fakes.joinCodeMemory,
    ...overrides,
  };
}
