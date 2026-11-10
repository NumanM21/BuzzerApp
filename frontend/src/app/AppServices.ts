import { ApiClient, type FetchFunction } from '@/api/ApiClient';
import { type ArchiveApi, HttpArchiveApi } from '@/api/ArchiveApi';
import { type EventApi, HttpEventApi } from '@/api/EventApi';
import { HttpPlayersApi } from '@/api/PlayersApi';
import { HttpScoresApi } from '@/api/ScoresApi';
import { HttpSessionApi } from '@/api/SessionApi';
import { HttpTeamsApi } from '@/api/TeamsApi';
import type { JoinCodeMemory } from '@/domain/joinCodeMemory';
import type { ThemeCatalog } from '@/domain/themeCatalog';
import { type GameEvents, NoGameEvents } from '@/realtime/GameEvents';
import { EventStore } from '@/stores/EventStore';
import { ScoresStore } from '@/stores/ScoresStore';
import { SessionStore } from '@/stores/SessionStore';
import { TeamsStore } from '@/stores/TeamsStore';
import { themeCatalog } from '@/theme/registry';
import { BrowserJoinCodeMemory } from './BrowserJoinCodeMemory';

/**
 * Everything a view model can be given: services and stores that live as long as the app. Like a C# DI container's
 * registrations, but built by hand in one place. View models receive the pieces they need through their
 * constructor (see `useViewModel`), so a test builds a view model with fakes instead.
 * F4 adds the game connection.
 */
export interface AppServices {
  themes: ThemeCatalog;
  event: EventStore;
  session: SessionStore;
  teams: TeamsStore;
  scores: ScoresStore;
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
  /** The hub's "data changed" messages. F4 passes the real connection; until then nothing ever fires. */
  events?: GameEvents;
}

/** The composition root: called once by `main.tsx`. */
export function createAppServices(options: AppServicesOptions = {}): AppServices {
  // A wrapper, not `fetch` itself: calling the browser's `fetch` as a method of another object throws.
  const {
    fetchFunction = (input, init) => fetch(input, init),
    events = new NoGameEvents(),
    joinCodeMemory = new BrowserJoinCodeMemory(),
  } = options;

  // The client needs the session store to report an ended session, and the session store needs the client's API
  // class, so the callback reaches the store through a variable that is assigned a moment later.
  const client = new ApiClient(fetchFunction, () => session.handleSessionExpired());
  const session = new SessionStore(new HttpSessionApi(client));
  const scores = new ScoresStore(new HttpScoresApi(client), session, events);
  const teams = new TeamsStore(new HttpTeamsApi(client), new HttpPlayersApi(client), session, scores, events);

  const eventApi = new HttpEventApi(client);

  return {
    themes: themeCatalog,
    event: new EventStore(eventApi),
    session,
    teams,
    scores,
    eventApi,
    archive: new HttpArchiveApi(client),
    joinCodeMemory,
  };
}
