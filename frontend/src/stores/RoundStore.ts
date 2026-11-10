import { makeAutoObservable, observableRef } from 'mobx';
import { clientRoundErrors } from '@/domain/roundErrors';
import type { GameConnection } from '@/realtime/GameConnection';
import type { AdminRoundSnapshot, ConnectionState, PublicRoundSnapshot, RoundResult } from '@/realtime/types';
import type { ServerClock } from './ServerClock';

/**
 * The live round, as the server last described it, and the round's commands. Every screen reads the round from
 * here; nothing keeps its own copy.
 *
 * **Versions.** Each stream (public, admin) numbers its snapshots, and an older one arriving late must not undo a
 * newer one, so the highest version seen is kept and a lower one is ignored. But the server's counter lives in
 * memory and restarts near zero with the server: a version kept across a dropped connection would make this store
 * ignore every snapshot after a server restart, for the rest of the night. So the versions are forgotten whenever
 * the connection is anything but connected (connecting, reconnecting, closed), and the snapshot the server sends
 * on connect is always taken. The snapshot itself is kept, so the screen doesn't go blank during a short drop.
 */
export class RoundStore {
  connectionState: ConnectionState;
  publicSnapshot: PublicRoundSnapshot | undefined = undefined;
  /** Admins only: the same round plus every individual buzz. */
  adminSnapshot: AdminRoundSnapshot | undefined = undefined;

  private publicVersion: number | undefined = undefined;
  private adminVersion: number | undefined = undefined;
  private readonly connection: GameConnection;
  private readonly clock: ServerClock;

  constructor(connection: GameConnection, clock: ServerClock) {
    this.connection = connection;
    this.clock = clock;
    this.connectionState = connection.state;

    // The store lives as long as the app, so these subscriptions are never undone. The arrows reach the methods
    // through `this` when a message arrives, by which time `makeAutoObservable` has made them actions.
    connection.onStateChanged((state) => this.setConnectionState(state));
    connection.onRoundUpdated((snapshot) => this.applyPublic(snapshot));
    connection.onAdminRoundUpdated((snapshot) => this.applyAdmin(snapshot));

    makeAutoObservable<RoundStore, 'publicVersion' | 'adminVersion' | 'connection' | 'clock'>(
      this,
      {
        // Snapshots are replaced whole and never changed in place, so only the reference needs watching.
        publicSnapshot: observableRef,
        adminSnapshot: observableRef,
        publicVersion: false,
        adminVersion: false,
        connection: false,
        clock: false,
      },
      { autoBind: true },
    );
  }

  get isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  // The commands never reject: a failure is a `RoundResult` with an error code for `describeRoundError`. A result's
  // `changed` is not a reason to act; the snapshot that follows is the truth.
  buzz(): Promise<RoundResult> {
    return this.send(() => this.connection.buzz());
  }

  beginRound(): Promise<RoundResult> {
    return this.send(() => this.connection.beginRound());
  }

  nextTeam(): Promise<RoundResult> {
    return this.send(() => this.connection.nextTeam());
  }

  resetRound(): Promise<RoundResult> {
    return this.send(() => this.connection.resetRound());
  }

  /** Forgets the round entirely: on sign-out, or when the connection restarts as someone else. */
  clear(): void {
    this.publicSnapshot = undefined;
    this.adminSnapshot = undefined;
    this.forgetVersions();
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    // Not on `connected`: the first snapshot of a connection may arrive before the connection reports it is up.
    if (state !== 'connected') {
      this.forgetVersions();
    }
  }

  private applyPublic(snapshot: PublicRoundSnapshot): void {
    if (isOutdated(snapshot.version, this.publicVersion)) {
      return;
    }
    this.publicVersion = snapshot.version;
    this.publicSnapshot = snapshot;
    this.clock.sync(snapshot.serverNow);
  }

  private applyAdmin(snapshot: AdminRoundSnapshot): void {
    if (isOutdated(snapshot.version, this.adminVersion)) {
      return;
    }
    this.adminVersion = snapshot.version;
    this.adminSnapshot = snapshot;
    this.clock.sync(snapshot.serverNow);
  }

  private forgetVersions(): void {
    this.publicVersion = undefined;
    this.adminVersion = undefined;
  }

  private async send(command: () => Promise<RoundResult>): Promise<RoundResult> {
    if (!this.isConnected) {
      return failure(clientRoundErrors.offline);
    }
    try {
      return await command();
    } catch {
      return failure(clientRoundErrors.failed);
    }
  }
}

/** Not newer than the newest already applied (a repeat counts as outdated). */
function isOutdated(version: number, newest: number | undefined): boolean {
  return newest !== undefined && version <= newest;
}

function failure(error: string): RoundResult {
  return { success: false, error, changed: false };
}
