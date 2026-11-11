import { reaction } from 'mobx';
import type { Me } from '@/api/types';
import type { GameConnection } from '@/realtime/GameConnection';
import type { RoundStore } from '@/stores/RoundStore';
import type { SessionStore } from '@/stores/SessionStore';
import type { PageVisibility } from './pageVisibility';

/**
 * Keeps the live connection in step with the session and the phone, for as long as the app runs. It is the one
 * place that joins stores, the connection and the browser; nothing in React starts or stops the connection, so
 * mounting and unmounting screens (and StrictMode doing it twice) can't disturb it.
 *
 * - **Connected only while signed in.** Signing in starts the connection; signing out (or the session ending)
 *   stops it and forgets the round.
 * - **A new identity is a new connection.** The hub keeps the identity a connection started with, so when the
 *   person changes or their role does (a player made an admin), the connection is restarted; otherwise a new admin
 *   would never receive the admin snapshots.
 * - **After every (re)connect, re-read the session.** The session may have ended while the phone was away (the
 *   session store then signs out and the guards show the join screen), or the role may have changed. The stores
 *   reload their own data on the same event (`onReconnected`).
 * - **A failed try, ask why.** The connection retries for ever, which is right while the server is away and wrong
 *   when the session has ended (the server lost its keys in a restart, or the cookie ran out): then every try is
 *   refused and the person would watch "Reconnecting…" all night. So each failed try re-reads the session; if it
 *   has ended, the session store signs out, this stops the connection, and the guards show the join screen.
 * - **Back in view, catch up.** A phone that wakes up retries a dropped connection at once instead of waiting for
 *   the next retry, and re-reads the session.
 *
 * The connection itself never gives up and copes with being started and stopped in quick succession; the version
 * rules for snapshots are the round store's.
 */
export class RealtimeCoordinator {
  private readonly connection: GameConnection;
  private readonly session: SessionStore;
  private readonly round: RoundStore;
  private readonly visibility: PageVisibility;
  private disposers: (() => void)[] = [];

  constructor(connection: GameConnection, session: SessionStore, round: RoundStore, visibility: PageVisibility) {
    this.connection = connection;
    this.session = session;
    this.round = round;
    this.visibility = visibility;
  }

  /** Starts following the session. Calling it again does nothing. */
  start(): void {
    if (this.disposers.length > 0) {
      return;
    }
    this.disposers = [
      reaction(
        () => connectionIdentity(this.session.me),
        (identity, previous) => this.identityChanged(identity, previous),
        { fireImmediately: true },
      ),
      this.connection.onStateChanged((state) => {
        if (state === 'connected') {
          this.refreshSession();
        }
      }),
      this.connection.onAttemptFailed(() => this.refreshSession()),
      this.visibility.onVisible(() => this.becameVisible()),
    ];
  }

  /** Stops following the session and closes the connection. */
  dispose(): void {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
    void this.connection.stop();
  }

  private identityChanged(identity: string | undefined, previous: string | undefined): void {
    if (previous !== undefined) {
      void this.connection.stop();
    }
    // Snapshots belong to the identity that received them (an admin's must not outlive their session).
    this.round.clear();
    if (identity !== undefined) {
      this.connection.start();
    }
  }

  private becameVisible(): void {
    if (this.session.status !== 'signedIn') {
      return;
    }
    this.connection.retryNow();
    this.refreshSession();
  }

  // `refresh()` never rejects. Only for a signed-in person: for anyone else a /me answer would sign them in.
  private refreshSession(): void {
    if (this.session.status === 'signedIn') {
      void this.session.refresh();
    }
  }
}

/** Who the hub would think is connected; `undefined` when nobody is signed in. */
function connectionIdentity(me: Me | undefined): string | undefined {
  return me === undefined ? undefined : `${me.playerId}:${me.role}`;
}
