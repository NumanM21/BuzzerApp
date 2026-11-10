import type { GameEvents, Unsubscribe } from './GameEvents';
import type { AdminRoundSnapshot, ConnectionState, PublicRoundSnapshot, RoundResult } from './types';

/**
 * The one live connection to the game hub (`/hubs/game`), as a plain interface so stores and tests never touch
 * SignalR. `SignalRGameConnection` is the real one; tests use `FakeGameConnection`.
 *
 * It also is the `GameEvents` the stores listen to. `onReconnected` fires after every successful connect, the first
 * included: whatever the stores loaded before may be out of date by then.
 */
export interface GameConnection extends GameEvents {
  readonly state: ConnectionState;

  /**
   * Connects, and keeps the connection up until `stop()`: a failed start is retried, and a dropped connection
   * reconnects, without ever giving up. Calling it again while started does nothing.
   */
  start(): void;
  /** Disconnects and stops retrying. Resolves once the connection is closed; never rejects. */
  stop(): Promise<void>;
  /**
   * Started but not connected (waiting for the next retry, or for the next reconnect attempt): try now instead.
   * Otherwise does nothing.
   */
  retryNow(): void;

  // Each rejects when there is no connection or the server refuses the call itself (a non-admin calling a host
  // method). A refusal by the round's rules is a resolved `RoundResult` with `success: false`.
  buzz(): Promise<RoundResult>;
  beginRound(): Promise<RoundResult>;
  nextTeam(): Promise<RoundResult>;
  resetRound(): Promise<RoundResult>;

  onRoundUpdated(callback: (snapshot: PublicRoundSnapshot) => void): Unsubscribe;
  onAdminRoundUpdated(callback: (snapshot: AdminRoundSnapshot) => void): Unsubscribe;
  onStateChanged(callback: (state: ConnectionState) => void): Unsubscribe;
}
