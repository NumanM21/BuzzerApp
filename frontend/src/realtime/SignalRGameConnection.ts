import { HubConnectionBuilder, LogLevel, type IRetryPolicy } from '@microsoft/signalr';
import type { GameConnection } from './GameConnection';
import type { Unsubscribe } from './GameEvents';
import { ListenerSet } from './ListenerSet';
import { retryDelayMs } from './retryDelays';
import type { AdminRoundSnapshot, ConnectionState, PublicRoundSnapshot, RoundResult } from './types';

/** The part of SignalR's `HubConnection` this class uses, so a test can stand in a stub. */
export interface HubConnectionLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  invoke<T>(methodName: string): Promise<T>;
  on(methodName: string, handler: (payload: unknown) => void): void;
  onclose(callback: (error?: Error) => void): void;
  onreconnecting(callback: (error?: Error) => void): void;
  onreconnected(callback: (connectionId?: string) => void): void;
}

export type HubFactory = () => HubConnectionLike;

// Same origin as the page (the API serves the app; in development Vite's proxy forwards it), so the browser sends
// the session cookie by itself.
const HUB_URL = '/hubs/game';

// SignalR's own reconnect, with delays that never run out (its default stops after four tries).
const keepTrying: IRetryPolicy = {
  nextRetryDelayInMilliseconds: (context) => retryDelayMs(context.previousRetryCount),
};

/** A new SignalR connection to the game hub. One per `start()`, so nothing from an old one can leak into the next. */
export function createGameHub(): HubConnectionLike {
  return new HubConnectionBuilder()
    .withUrl(HUB_URL)
    .withAutomaticReconnect(keepTrying)
    .configureLogging(LogLevel.Warning)
    .build();
}

type HubMethod = 'Buzz' | 'BeginRound' | 'NextTeam' | 'ResetRound';

/**
 * The real `GameConnection`. The hard part is the life cycle; the rules it keeps:
 *
 * - **Exactly one live connection.** Every `start()` builds a new `HubConnection`. `hub` is the current one, and a
 *   callback from any other (stopped, or replaced) is ignored, so a late message or `onclose` can't do harm. A new
 *   connection waits until every connection being stopped has closed before it connects.
 * - **Never gives up.** SignalR reconnects a dropped connection by itself (with `keepTrying`), but it doesn't retry a
 *   failed first start, and it gives up if the server closes the connection for good. Both are retried here, with
 *   the same delays, for as long as the app wants the connection (`wanted`).
 * - **No unhandled rejections.** A start that fails or is cancelled by `stop()` is caught here.
 *
 * React's StrictMode (start, stop, start in quick succession) is therefore one connection that connects once the
 * first, stopped one has closed.
 */
export class SignalRGameConnection implements GameConnection {
  private readonly createHub: HubFactory;
  private readonly roundUpdated = new ListenerSet<PublicRoundSnapshot>();
  private readonly adminRoundUpdated = new ListenerSet<AdminRoundSnapshot>();
  private readonly teamsChanged = new ListenerSet();
  private readonly scoresChanged = new ListenerSet();
  private readonly reconnected = new ListenerSet();
  private readonly stateChanged = new ListenerSet<ConnectionState>();

  private currentState: ConnectionState = 'disconnected';
  private hub: HubConnectionLike | undefined = undefined;
  private wanted = false;
  private failedTries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  /** Settles when every connection being stopped has closed. */
  private stopping: Promise<void> = Promise.resolve();

  /** `createHub` is replaced by tests; the app uses `createGameHub`. */
  constructor(createHub: HubFactory = createGameHub) {
    this.createHub = createHub;
  }

  get state(): ConnectionState {
    return this.currentState;
  }

  start(): void {
    if (this.wanted) {
      return;
    }
    this.wanted = true;
    this.failedTries = 0;
    void this.connect();
  }

  async stop(): Promise<void> {
    this.wanted = false;
    this.cancelRetry();
    this.dropHub();
    this.setState('disconnected');
    await this.stopping;
  }

  retryNow(): void {
    if (!this.wanted) {
      return;
    }
    if (this.retryTimer !== undefined) {
      this.cancelRetry();
      void this.connect();
    } else if (this.currentState === 'reconnecting') {
      // SignalR may be waiting up to the longest delay before its next try. A fresh connection starts at once.
      this.dropHub();
      void this.connect();
    }
  }

  buzz(): Promise<RoundResult> {
    return this.invoke('Buzz');
  }

  beginRound(): Promise<RoundResult> {
    return this.invoke('BeginRound');
  }

  nextTeam(): Promise<RoundResult> {
    return this.invoke('NextTeam');
  }

  resetRound(): Promise<RoundResult> {
    return this.invoke('ResetRound');
  }

  onRoundUpdated(callback: (snapshot: PublicRoundSnapshot) => void): Unsubscribe {
    return this.roundUpdated.add(callback);
  }

  onAdminRoundUpdated(callback: (snapshot: AdminRoundSnapshot) => void): Unsubscribe {
    return this.adminRoundUpdated.add(callback);
  }

  onTeamsChanged(callback: () => void): Unsubscribe {
    return this.teamsChanged.add(callback);
  }

  onScoresChanged(callback: () => void): Unsubscribe {
    return this.scoresChanged.add(callback);
  }

  onReconnected(callback: () => void): Unsubscribe {
    return this.reconnected.add(callback);
  }

  onStateChanged(callback: (state: ConnectionState) => void): Unsubscribe {
    return this.stateChanged.add(callback);
  }

  private async connect(): Promise<void> {
    const hub = this.createHub();
    this.hub = hub;
    this.listen(hub);
    // Before `hub.start()`: the server sends a snapshot as soon as the connection is up, possibly before `start()`
    // resolves, and listeners (the round store) must have forgotten the old version numbers by then.
    this.setState('connecting');
    try {
      await this.stopping;
      if (hub !== this.hub) {
        return;
      }
      await hub.start();
    } catch {
      // A start cancelled by `stop()` (or by `retryNow()`) lands here too; only the current connection retries.
      if (hub === this.hub) {
        this.hub = undefined;
        this.setState('disconnected');
        this.scheduleRetry();
      }
      return;
    }
    if (hub !== this.hub) {
      return;
    }
    this.failedTries = 0;
    this.setState('connected');
    this.reconnected.emit();
  }

  private listen(hub: HubConnectionLike): void {
    const isCurrent = () => hub === this.hub;
    hub.on('RoundUpdated', (snapshot) => {
      if (isCurrent()) {
        this.roundUpdated.emit(snapshot as PublicRoundSnapshot);
      }
    });
    hub.on('AdminRoundUpdated', (snapshot) => {
      if (isCurrent()) {
        this.adminRoundUpdated.emit(snapshot as AdminRoundSnapshot);
      }
    });
    hub.on('TeamsChanged', () => {
      if (isCurrent()) {
        this.teamsChanged.emit();
      }
    });
    hub.on('ScoresChanged', () => {
      if (isCurrent()) {
        this.scoresChanged.emit();
      }
    });
    hub.onreconnecting(() => {
      if (isCurrent()) {
        this.setState('reconnecting');
      }
    });
    hub.onreconnected(() => {
      if (isCurrent()) {
        this.failedTries = 0;
        this.setState('connected');
        this.reconnected.emit();
      }
    });
    // With `keepTrying`, SignalR closes a connection only when told to, or when the server ends it for good.
    hub.onclose(() => {
      if (isCurrent()) {
        this.hub = undefined;
        this.setState('disconnected');
        this.scheduleRetry();
      }
    });
  }

  private invoke(method: HubMethod): Promise<RoundResult> {
    const hub = this.hub;
    if (hub === undefined || this.currentState !== 'connected') {
      return Promise.reject(new Error('Not connected to the game.'));
    }
    return hub.invoke<RoundResult>(method);
  }

  /** Stops the current connection (if any) and forgets it; `stopping` settles once it has closed. */
  private dropHub(): void {
    const hub = this.hub;
    if (hub === undefined) {
      return;
    }
    this.hub = undefined;
    const closed = hub.stop().catch(() => undefined);
    this.stopping = Promise.all([this.stopping, closed]).then(() => undefined);
  }

  private scheduleRetry(): void {
    if (!this.wanted) {
      return;
    }
    const delay = retryDelayMs(this.failedTries);
    this.failedTries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.connect();
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private setState(state: ConnectionState): void {
    if (state === this.currentState) {
      return;
    }
    this.currentState = state;
    this.stateChanged.emit(state);
  }
}
