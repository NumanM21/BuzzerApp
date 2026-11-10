import type { GameConnection } from '@/realtime/GameConnection';
import type { Unsubscribe } from '@/realtime/GameEvents';
import { ListenerSet } from '@/realtime/ListenerSet';
import type { AdminRoundSnapshot, ConnectionState, PublicRoundSnapshot, RoundResult } from '@/realtime/types';
import { FakeGameEvents } from './FakeGameEvents';

type RoundCommand = 'buzz' | 'beginRound' | 'nextTeam' | 'resetRound';

/**
 * A `GameConnection` the test drives by hand. `start()` and `stop()` only record the call and move the state as the
 * real one does at that moment; the test plays the rest: `connect()` (the server accepted), `drop()`, snapshots,
 * and the answer to each command.
 *
 * It is also the stores' `GameEvents` (`emitTeamsChanged()` and friends), so one fake serves every store.
 */
export class FakeGameConnection extends FakeGameEvents implements GameConnection {
  /** `start`, `stop`, `retryNow` and each command, in the order called. */
  readonly calls: string[] = [];
  /** What each command answers. An `Error` makes it reject, as the real one does when the call itself fails. */
  readonly answers: Record<RoundCommand, RoundResult | Error> = {
    buzz: { success: true, error: null, changed: true },
    beginRound: { success: true, error: null, changed: true },
    nextTeam: { success: true, error: null, changed: true },
    resetRound: { success: true, error: null, changed: true },
  };

  private currentState: ConnectionState = 'disconnected';
  private readonly roundUpdated = new ListenerSet<PublicRoundSnapshot>();
  private readonly adminRoundUpdated = new ListenerSet<AdminRoundSnapshot>();
  private readonly stateChanged = new ListenerSet<ConnectionState>();

  get state(): ConnectionState {
    return this.currentState;
  }

  start(): void {
    this.calls.push('start');
    this.setState('connecting');
  }

  stop(): Promise<void> {
    this.calls.push('stop');
    this.setState('disconnected');
    return Promise.resolve();
  }

  retryNow(): void {
    this.calls.push('retryNow');
  }

  buzz(): Promise<RoundResult> {
    return this.answer('buzz');
  }

  beginRound(): Promise<RoundResult> {
    return this.answer('beginRound');
  }

  nextTeam(): Promise<RoundResult> {
    return this.answer('nextTeam');
  }

  resetRound(): Promise<RoundResult> {
    return this.answer('resetRound');
  }

  onRoundUpdated(callback: (snapshot: PublicRoundSnapshot) => void): Unsubscribe {
    return this.roundUpdated.add(callback);
  }

  onAdminRoundUpdated(callback: (snapshot: AdminRoundSnapshot) => void): Unsubscribe {
    return this.adminRoundUpdated.add(callback);
  }

  onStateChanged(callback: (state: ConnectionState) => void): Unsubscribe {
    return this.stateChanged.add(callback);
  }

  /** Forgets the calls so far, to assert only on what a later step did. */
  clearCalls(): void {
    this.calls.length = 0;
  }

  /** The server accepted the connection: connected, and (as the real one) "reload, you may have missed things". */
  connect(): void {
    this.setState('connected');
    this.emitReconnected();
  }

  /** The connection dropped and SignalR is trying to get it back. */
  drop(): void {
    this.setState('reconnecting');
  }

  setState(state: ConnectionState): void {
    if (state === this.currentState) {
      return;
    }
    this.currentState = state;
    this.stateChanged.emit(state);
  }

  emitRoundUpdated(snapshot: PublicRoundSnapshot): void {
    this.roundUpdated.emit(snapshot);
  }

  emitAdminRoundUpdated(snapshot: AdminRoundSnapshot): void {
    this.adminRoundUpdated.emit(snapshot);
  }

  private answer(command: RoundCommand): Promise<RoundResult> {
    this.calls.push(command);
    const answer = this.answers[command];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  }
}
