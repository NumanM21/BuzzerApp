import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, type Deferred } from '@/test/deferred';
import { flushPromises } from '@/test/flushPromises';
import { makePublicSnapshot } from '@/test/factories';
import type { HubConnectionLike } from './SignalRGameConnection';
import { SignalRGameConnection } from './SignalRGameConnection';
import type { ConnectionState, PublicRoundSnapshot, RoundResult } from './types';

/**
 * Stands in for SignalR's `HubConnection`: the test decides when a start succeeds or fails and plays the server's
 * messages and SignalR's reconnect callbacks. `isLive` is what the server would see: started and not yet stopped.
 */
class StubHub implements HubConnectionLike {
  startCalls = 0;
  stopCalls = 0;
  isLive = false;
  readonly invoked: string[] = [];
  invokeResult: RoundResult = { success: true, error: null, changed: true };
  /** Set to make `stop()` take as long as the test wants. */
  slowStop: Deferred<void> | undefined = undefined;

  private pendingStart: Deferred<void> | undefined = undefined;
  private readonly reconnectAttemptFailed: () => void;
  private readonly handlers = new Map<string, (payload: unknown) => void>();
  private closed: ((error?: Error) => void) | undefined = undefined;
  private reconnecting: ((error?: Error) => void) | undefined = undefined;
  private reconnected: ((connectionId?: string) => void) | undefined = undefined;

  /** `reconnectAttemptFailed` is what the connection hands every hub it builds, for SignalR's retry policy to call. */
  constructor(reconnectAttemptFailed: () => void) {
    this.reconnectAttemptFailed = reconnectAttemptFailed;
  }

  start(): Promise<void> {
    this.startCalls += 1;
    this.pendingStart = deferred<void>();
    return this.pendingStart.promise;
  }

  stop(): Promise<void> {
    this.stopCalls += 1;
    // Like SignalR: stopping during a start makes that start reject; stopping a live connection reports a close.
    this.pendingStart?.reject(new Error('The connection was stopped during negotiation.'));
    this.pendingStart = undefined;
    if (this.isLive) {
      this.isLive = false;
      this.closed?.();
    }
    return this.slowStop?.promise ?? Promise.resolve();
  }

  invoke<T>(methodName: string): Promise<T> {
    this.invoked.push(methodName);
    return Promise.resolve(this.invokeResult as T);
  }

  on(methodName: string, handler: (payload: unknown) => void): void {
    this.handlers.set(methodName, handler);
  }

  onclose(callback: (error?: Error) => void): void {
    this.closed = callback;
  }

  onreconnecting(callback: (error?: Error) => void): void {
    this.reconnecting = callback;
  }

  onreconnected(callback: (connectionId?: string) => void): void {
    this.reconnected = callback;
  }

  get isStarting(): boolean {
    return this.pendingStart !== undefined;
  }

  acceptStart(): void {
    this.isLive = true;
    this.pendingStart?.resolve();
    this.pendingStart = undefined;
  }

  failStart(): void {
    this.pendingStart?.reject(new Error('Failed to complete negotiation with the server.'));
    this.pendingStart = undefined;
  }

  send(methodName: string, payload?: unknown): void {
    this.handlers.get(methodName)?.(payload);
  }

  dropConnection(): void {
    this.reconnecting?.(new Error('WebSocket closed.'));
  }

  /** One of SignalR's own tries to get the connection back failed (it then waits and tries again). */
  failReconnectAttempt(): void {
    this.reconnectAttemptFailed();
  }

  completeReconnect(): void {
    this.reconnected?.('new-id');
  }

  closeForGood(): void {
    this.isLive = false;
    this.closed?.(new Error('Server closed the connection.'));
  }
}

function setup() {
  const hubs: StubHub[] = [];
  const connection = new SignalRGameConnection((reconnectAttemptFailed) => {
    const hub = new StubHub(reconnectAttemptFailed);
    hubs.push(hub);
    return hub;
  });
  const states: ConnectionState[] = [];
  const reconnects = { count: 0 };
  const snapshots: PublicRoundSnapshot[] = [];
  const failedAttempts = { count: 0 };
  connection.onAttemptFailed(() => {
    failedAttempts.count += 1;
  });
  connection.onStateChanged((state) => states.push(state));
  connection.onReconnected(() => {
    reconnects.count += 1;
  });
  connection.onRoundUpdated((snapshot) => snapshots.push(snapshot));
  const lastHub = () => hubs[hubs.length - 1];
  const liveHubs = () => hubs.filter((hub) => hub.isLive).length;
  return { connection, hubs, lastHub, liveHubs, states, reconnects, snapshots, failedAttempts };
}

/** Lets the connection get past waiting for earlier connections to close, to its `hub.start()`. */
async function settle(): Promise<void> {
  await flushPromises();
}

/** Moves the fake clock on (firing due retries), then lets the connection reach its next `hub.start()`. */
async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

describe('SignalRGameConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('start', () => {
    it('connects, then says so and tells the stores to reload', async () => {
      const { connection, lastHub, states, reconnects } = setup();

      connection.start();
      await settle();
      expect(connection.state).toBe('connecting');
      lastHub().acceptStart();
      await settle();

      expect(connection.state).toBe('connected');
      expect(states).toEqual(['connecting', 'connected']);
      expect(reconnects.count).toBe(1);
    });

    it('does nothing when already started', async () => {
      const { connection, hubs } = setup();

      connection.start();
      connection.start();
      await settle();

      expect(hubs).toHaveLength(1);
      expect(hubs[0].startCalls).toBe(1);
    });

    it('says "connecting" before the hub starts, so a snapshot sent on connect meets a reset listener', async () => {
      const { connection, lastHub, states, snapshots } = setup();

      connection.start();
      await settle();
      // The server's first snapshot can arrive before `start()` resolves.
      lastHub().send('RoundUpdated', makePublicSnapshot({ version: 1 }));

      expect(states).toEqual(['connecting']);
      expect(snapshots.map((snapshot) => snapshot.version)).toEqual([1]);
    });

    it('retries a failed first start with the reconnect delays, for as long as it is wanted', async () => {
      const { connection, hubs, lastHub } = setup();
      connection.start();
      await settle();
      const expectedDelays = [0, 1_000, 2_000, 5_000, 10_000, 10_000, 10_000];

      for (const delay of expectedDelays) {
        const before = hubs.length;
        lastHub().failStart();
        await settle();
        expect(connection.state).toBe('disconnected');
        if (delay > 0) {
          await tick(delay - 1);
          expect(hubs).toHaveLength(before);
        }
        await tick(1);
        await settle();
        expect(hubs).toHaveLength(before + 1);
        expect(lastHub().isStarting).toBe(true);
      }
    });

    it('starts the retry delays from the beginning after a success', async () => {
      const { connection, hubs, lastHub } = setup();
      connection.start();
      await settle();
      lastHub().failStart();
      await settle();
      await tick(0);
      lastHub().failStart();
      await settle();
      await tick(1_000);
      lastHub().acceptStart();
      await settle();

      lastHub().closeForGood();
      await tick(0);
      await settle();

      expect(hubs).toHaveLength(4);
      expect(lastHub().isStarting).toBe(true);
    });
  });

  describe('stop', () => {
    it('disconnects and stops retrying', async () => {
      const { connection, hubs, lastHub, liveHubs } = setup();
      connection.start();
      await settle();
      lastHub().acceptStart();
      await settle();

      await connection.stop();
      await tick(60_000);

      expect(connection.state).toBe('disconnected');
      expect(liveHubs()).toBe(0);
      expect(hubs).toHaveLength(1);
    });

    it('cancels a start in progress without an unhandled rejection or a retry', async () => {
      const { connection, hubs, lastHub } = setup();
      connection.start();
      await settle();
      expect(lastHub().isStarting).toBe(true);

      await connection.stop();
      await tick(60_000);

      expect(connection.state).toBe('disconnected');
      expect(hubs).toHaveLength(1);
      expect(hubs[0].stopCalls).toBe(1);
    });

    it('cancels a retry that is waiting', async () => {
      const { connection, hubs, lastHub } = setup();
      connection.start();
      await settle();
      lastHub().failStart();
      await settle();
      await tick(0);
      lastHub().failStart();
      await settle();

      await connection.stop();
      await tick(60_000);

      expect(hubs).toHaveLength(2);
    });

    it('is safe to call when never started, and twice', async () => {
      const { connection, states } = setup();

      await connection.stop();
      await connection.stop();

      expect(connection.state).toBe('disconnected');
      expect(states).toEqual([]);
    });
  });

  describe('StrictMode: start, stop, start in quick succession', () => {
    it('leaves exactly one live connection', async () => {
      const { connection, hubs, lastHub, liveHubs } = setup();

      connection.start();
      void connection.stop();
      connection.start();
      await settle();
      lastHub().acceptStart();
      await settle();

      expect(hubs).toHaveLength(2);
      expect(hubs[0].startCalls).toBe(0);
      expect(liveHubs()).toBe(1);
      expect(connection.state).toBe('connected');
    });

    it('connects the new connection only once the old one has closed', async () => {
      const { connection, hubs, liveHubs } = setup();
      connection.start();
      await settle();
      hubs[0].acceptStart();
      await settle();
      const slowStop = deferred<void>();
      hubs[0].slowStop = slowStop;

      void connection.stop();
      connection.start();
      await settle();
      expect(hubs[1].startCalls).toBe(0);

      slowStop.resolve();
      await settle();
      hubs[1].acceptStart();
      await settle();

      expect(liveHubs()).toBe(1);
      expect(connection.state).toBe('connected');
    });

    it('ignores what a stopped connection still sends', async () => {
      const { connection, hubs, snapshots, reconnects } = setup();
      connection.start();
      await settle();
      hubs[0].acceptStart();
      await settle();
      await connection.stop();
      connection.start();
      await settle();

      hubs[0].send('RoundUpdated', makePublicSnapshot({ version: 99 }));
      hubs[0].completeReconnect();
      hubs[0].closeForGood();

      expect(snapshots).toEqual([]);
      expect(reconnects.count).toBe(1);
      expect(connection.state).toBe('connecting');
    });
  });

  describe('a dropped connection', () => {
    async function connected() {
      const context = setup();
      context.connection.start();
      await settle();
      context.lastHub().acceptStart();
      await settle();
      return context;
    }

    it('reports reconnecting, then connected, and tells the stores to reload', async () => {
      const { connection, lastHub, states, reconnects } = await connected();

      lastHub().dropConnection();
      expect(connection.state).toBe('reconnecting');
      lastHub().completeReconnect();

      expect(connection.state).toBe('connected');
      expect(states).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
      expect(reconnects.count).toBe(2);
    });

    it('starts a new connection when SignalR closes this one', async () => {
      const { connection, hubs, lastHub } = await connected();

      lastHub().closeForGood();
      expect(connection.state).toBe('disconnected');
      await tick(0);
      await settle();

      expect(hubs).toHaveLength(2);
      expect(connection.state).toBe('connecting');
    });
  });

  describe('a failed attempt is reported (the session may have ended; the coordinator asks)', () => {
    it('for a first start the server refuses', async () => {
      const { connection, lastHub, failedAttempts } = setup();
      connection.start();
      await settle();

      lastHub().failStart();
      await settle();

      expect(failedAttempts.count).toBe(1);
    });

    it("for each of SignalR's own tries to get a dropped connection back", async () => {
      const { connection, lastHub, failedAttempts } = setup();
      connection.start();
      await settle();
      lastHub().acceptStart();
      await settle();
      lastHub().dropConnection();

      lastHub().failReconnectAttempt();
      lastHub().failReconnectAttempt();

      expect(connection.state).toBe('reconnecting');
      expect(failedAttempts.count).toBe(2);
    });

    it('not for a start that stop() cancelled, nor for anything a stopped connection says later', async () => {
      const { connection, lastHub, failedAttempts } = setup();
      connection.start();
      await settle();
      const stopped = lastHub();

      await connection.stop();
      await settle();
      stopped.failReconnectAttempt();

      expect(failedAttempts.count).toBe(0);
    });
  });

  describe('retryNow', () => {
    it('tries at once instead of waiting for the next retry', async () => {
      const { connection, hubs, lastHub } = setup();
      connection.start();
      await settle();
      lastHub().failStart();
      await settle();
      await tick(0);
      // The second failure waits a second before the next try.
      lastHub().failStart();
      await settle();
      const before = hubs.length;

      connection.retryNow();
      await settle();

      expect(hubs).toHaveLength(before + 1);
      expect(lastHub().isStarting).toBe(true);
      // The cancelled timer doesn't start a second connection later.
      await tick(10_000);
      expect(hubs).toHaveLength(before + 1);
    });

    it('replaces a connection that is waiting to reconnect', async () => {
      const { connection, hubs, liveHubs } = setup();
      connection.start();
      await settle();
      hubs[0].acceptStart();
      await settle();
      hubs[0].dropConnection();

      connection.retryNow();
      await settle();
      hubs[1].acceptStart();
      await settle();

      expect(hubs[0].stopCalls).toBe(1);
      expect(liveHubs()).toBe(1);
      expect(connection.state).toBe('connected');
    });

    it.each(['connected', 'never started'])('does nothing when %s', async (situation) => {
      const { connection, hubs, lastHub } = setup();
      if (situation === 'connected') {
        connection.start();
        await settle();
        lastHub().acceptStart();
        await settle();
      }
      const before = hubs.length;

      connection.retryNow();
      await settle();

      expect(hubs).toHaveLength(before);
    });
  });

  describe('messages and calls', () => {
    it.each([
      ['TeamsChanged', 'onTeamsChanged'],
      ['ScoresChanged', 'onScoresChanged'],
    ] as const)('passes %s on', async (message, subscribe) => {
      const { connection, lastHub } = setup();
      const listener = vi.fn();
      connection[subscribe](listener);
      connection.start();
      await settle();
      lastHub().acceptStart();
      await settle();

      lastHub().send(message);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('passes admin snapshots on', async () => {
      const { connection, lastHub } = setup();
      const listener = vi.fn();
      connection.onAdminRoundUpdated(listener);
      connection.start();
      await settle();
      lastHub().acceptStart();
      await settle();

      lastHub().send('AdminRoundUpdated', { version: 3 });

      expect(listener).toHaveBeenCalledWith({ version: 3 });
    });

    it('stops calling a listener once it unsubscribes', async () => {
      const { connection, lastHub } = setup();
      const listener = vi.fn();
      const unsubscribe = connection.onTeamsChanged(listener);
      connection.start();
      await settle();
      lastHub().acceptStart();
      await settle();

      unsubscribe();
      lastHub().send('TeamsChanged');

      expect(listener).not.toHaveBeenCalled();
    });

    it.each([
      ['buzz', 'Buzz'],
      ['beginRound', 'BeginRound'],
      ['nextTeam', 'NextTeam'],
      ['resetRound', 'ResetRound'],
    ] as const)('%s invokes %s with no arguments and returns its result', async (command, hubMethod) => {
      const { connection, lastHub } = setup();
      connection.start();
      await settle();
      lastHub().acceptStart();
      await settle();
      lastHub().invokeResult = { success: false, error: 'round.notOpen', changed: false };

      const result = await connection[command]();

      expect(lastHub().invoked).toEqual([hubMethod]);
      expect(result).toEqual({ success: false, error: 'round.notOpen', changed: false });
    });

    it('rejects a call while not connected, without sending it', async () => {
      const { connection, lastHub } = setup();
      connection.start();
      await settle();

      await expect(connection.buzz()).rejects.toThrow('Not connected');
      expect(lastHub().invoked).toEqual([]);
    });
  });
});
