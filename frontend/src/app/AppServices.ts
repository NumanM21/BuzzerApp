import { ApiClient, type FetchFunction } from '@/api/ApiClient';
import { type ArchiveApi, HttpArchiveApi } from '@/api/ArchiveApi';
import { type EventApi, HttpEventApi } from '@/api/EventApi';
import { HttpPlayersApi } from '@/api/PlayersApi';
import { HttpScoresApi } from '@/api/ScoresApi';
import { HttpSessionApi } from '@/api/SessionApi';
import { HttpTeamsApi } from '@/api/TeamsApi';
import type { JoinCodeMemory } from '@/domain/joinCodeMemory';
import type { ThemeCatalog } from '@/domain/themeCatalog';
import type { GameConnection } from '@/realtime/GameConnection';
import { SignalRGameConnection } from '@/realtime/SignalRGameConnection';
import { EventStore } from '@/stores/EventStore';
import { RoundStore } from '@/stores/RoundStore';
import { ScoresStore } from '@/stores/ScoresStore';
import { ServerClock } from '@/stores/ServerClock';
import { SessionStore } from '@/stores/SessionStore';
import { TeamsStore } from '@/stores/TeamsStore';
import { themeCatalog } from '@/theme/registry';
import { BrowserJoinCodeMemory } from './BrowserJoinCodeMemory';

/**
 * Everything a view model can be given: services and stores that live as long as the app. Like a C# DI container's
 * registrations, but built by hand in one place. View models receive the pieces they need through their
 * constructor (see `useViewModel`), so a test builds a view model with fakes instead.
 *
 * The live connection itself is not here: view models reach the round through `round`, and only the
 * `RealtimeCoordinator` (built next to these in `main.tsx`) starts and stops the connection.
 */
export interface AppServices {
  themes: ThemeCatalog;
  event: EventStore;
  session: SessionStore;
  teams: TeamsStore;
  scores: ScoresStore;
  /** The live round from the hub, and its commands. */
  round: RoundStore;
  /** The server's time, for anything measured against a time the server sent. */
  clock: ServerClock;
  /**
   * No store for these two: the join teams belong to one join code and are fetched on demand (F3's join screen),
   * and finalizing and exporting are one-off host actions with nothing to keep.
   */
  eventApi: EventApi;
  archive: ArchiveApi;
  /** The last join code used on this phone (`localStorage`); the join screen's only use of browser storage. */
  joinCodeMemory: JoinCodeMemory;
}

export interface AppServicesOptions {
  /** Replaced by tests. Defaults to the browser's `fetch`. */
  fetchFunction?: FetchFunction;
  /** Replaced by tests. Defaults to `localStorage`. */
  joinCodeMemory?: JoinCodeMemory;
  /** The live connection. Defaults to SignalR; `main.tsx` passes its own so the coordinator can drive it. */
  connection?: GameConnection;
}

/** The composition root: called once by `main.tsx`. */
export function createAppServices(options: AppServicesOptions = {}): AppServices {
  // A wrapper, not `fetch` itself: calling the browser's `fetch` as a method of another object throws.
  const {
    fetchFunction = (input, init) => fetch(input, init),
    connection = new SignalRGameConnection(),
    joinCodeMemory = new BrowserJoinCodeMemory(),
  } = options;

  // The client needs the session store to report an ended session, and the session store needs the client's API
  // class, so the callback reaches the store through a variable that is assigned a moment later.
  const client = new ApiClient(fetchFunction, () => session.handleSessionExpired());
  const session = new SessionStore(new HttpSessionApi(client));
  const scores = new ScoresStore(new HttpScoresApi(client), session, connection);
  const teams = new TeamsStore(new HttpTeamsApi(client), new HttpPlayersApi(client), session, scores, connection);
  const clock = new ServerClock();

  const eventApi = new HttpEventApi(client);

  return {
    themes: themeCatalog,
    event: new EventStore(eventApi),
    session,
    teams,
    scores,
    round: new RoundStore(connection, clock),
    clock,
    eventApi,
    archive: new HttpArchiveApi(client),
    joinCodeMemory,
  };
}
