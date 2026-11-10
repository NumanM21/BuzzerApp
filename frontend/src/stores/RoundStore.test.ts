import { describe, expect, it } from 'vitest';
import type { ConnectionState } from '@/realtime/types';
import { makeAdminSnapshot, makePublicSnapshot, makeTeamQueue } from '@/test/factories';
import { FakeGameConnection } from '@/test/fakes/FakeGameConnection';
import { RoundStore } from './RoundStore';
import { ServerClock } from './ServerClock';

function setup() {
  const connection = new FakeGameConnection();
  const phone = { nowMs: Date.UTC(2030, 0, 1, 20, 0, 0) };
  const clock = new ServerClock(() => phone.nowMs);
  const store = new RoundStore(connection, clock);
  return { connection, clock, phone, store };
}

function connected() {
  const context = setup();
  context.connection.start();
  context.connection.connect();
  return context;
}

describe('RoundStore', () => {
  it('follows the connection state', () => {
    const { connection, store } = setup();
    const seen: ConnectionState[] = [];

    for (const state of ['connecting', 'connected', 'reconnecting', 'disconnected'] as const) {
      connection.setState(state);
      seen.push(store.connectionState);
    }

    expect(seen).toEqual(['connecting', 'connected', 'reconnecting', 'disconnected']);
    expect(store.isConnected).toBe(false);
  });

  describe('snapshots', () => {
    it('keeps the latest public and admin snapshots', () => {
      const { connection, store } = connected();
      const open = makePublicSnapshot({ version: 4, phase: 'open', teamQueue: makeTeamQueue([3, 1]) });
      const admin = makeAdminSnapshot({ version: 9, phase: 'open', teamQueue: makeTeamQueue([3, 1]) });

      connection.emitRoundUpdated(open);
      connection.emitAdminRoundUpdated(admin);

      expect(store.publicSnapshot).toBe(open);
      expect(store.adminSnapshot).toBe(admin);
    });

    it('ignores an older or repeated snapshot that arrives late', () => {
      const { connection, store } = connected();
      const newest = makePublicSnapshot({ version: 5, phase: 'locked' });
      connection.emitRoundUpdated(newest);

      connection.emitRoundUpdated(makePublicSnapshot({ version: 4, phase: 'open' }));
      connection.emitRoundUpdated(makePublicSnapshot({ version: 5, phase: 'idle' }));

      expect(store.publicSnapshot).toBe(newest);
    });

    it('keeps the version of each stream apart', () => {
      const { connection, store } = connected();
      connection.emitAdminRoundUpdated(makeAdminSnapshot({ version: 40 }));

      const publicSnapshot = makePublicSnapshot({ version: 3 });
      connection.emitRoundUpdated(publicSnapshot);
      const olderAdmin = makeAdminSnapshot({ version: 39 });
      connection.emitAdminRoundUpdated(olderAdmin);

      expect(store.publicSnapshot).toBe(publicSnapshot);
      expect(store.adminSnapshot?.version).toBe(40);
    });

    describe('after the server restarted (version 57, then a new connection sending version 1)', () => {
      it.each<[string, (connection: FakeGameConnection) => void]>([
        ['the connection drops and SignalR reconnects', (connection) => connection.drop()],
        ['the connection closes and a new one starts', (connection) => {
          connection.setState('disconnected');
          connection.setState('connecting');
        }],
      ])('takes the new snapshots when %s', (_, loseConnection) => {
        const { connection, store } = connected();
        connection.emitRoundUpdated(makePublicSnapshot({ version: 57, phase: 'locked' }));
        connection.emitAdminRoundUpdated(makeAdminSnapshot({ version: 57, phase: 'locked' }));

        loseConnection(connection);
        // The server sends its first snapshot as the connection comes up, before it reports "connected".
        const fresh = makePublicSnapshot({ version: 1, phase: 'idle' });
        const freshAdmin = makeAdminSnapshot({ version: 1, phase: 'idle' });
        connection.emitRoundUpdated(fresh);
        connection.emitAdminRoundUpdated(freshAdmin);
        connection.connect();
        connection.emitRoundUpdated(makePublicSnapshot({ version: 2, phase: 'open' }));

        expect(store.publicSnapshot?.version).toBe(2);
        expect(store.adminSnapshot).toBe(freshAdmin);
      });
    });

    it('keeps showing the last snapshot while the connection is down', () => {
      const { connection, store } = connected();
      const snapshot = makePublicSnapshot({ version: 8, phase: 'open' });
      connection.emitRoundUpdated(snapshot);

      connection.drop();

      expect(store.publicSnapshot).toBe(snapshot);
    });

    it('forgets everything on clear, versions included', () => {
      const { connection, store } = connected();
      connection.emitRoundUpdated(makePublicSnapshot({ version: 30 }));
      connection.emitAdminRoundUpdated(makeAdminSnapshot({ version: 30 }));

      store.clear();

      expect(store.publicSnapshot).toBeUndefined();
      expect(store.adminSnapshot).toBeUndefined();
      connection.emitRoundUpdated(makePublicSnapshot({ version: 2 }));
      expect(store.publicSnapshot?.version).toBe(2);
    });

    it("sets the server clock from each snapshot's serverNow", () => {
      const { connection, clock, phone } = connected();
      const serverMs = phone.nowMs + 3_000;

      connection.emitRoundUpdated(makePublicSnapshot({ version: 1, serverNow: new Date(serverMs).toISOString() }));

      expect(clock.now()).toBe(serverMs);
    });

    it('does not set the clock from a snapshot it ignores', () => {
      const { connection, clock, phone } = connected();
      connection.emitRoundUpdated(makePublicSnapshot({ version: 2, serverNow: new Date(phone.nowMs).toISOString() }));

      connection.emitRoundUpdated(makePublicSnapshot({ version: 1, serverNow: new Date(phone.nowMs - 60_000).toISOString() }));

      expect(clock.offsetMs).toBe(0);
    });
  });

  describe('commands', () => {
    const commands = ['buzz', 'beginRound', 'nextTeam', 'resetRound'] as const;

    it.each(commands)('%s passes the server answer through', async (command) => {
      const { connection, store } = connected();
      connection.answers[command] = { success: false, error: 'round.notOpen', changed: false };

      const result = await store[command]();

      expect(connection.calls).toContain(command);
      expect(result).toEqual({ success: false, error: 'round.notOpen', changed: false });
    });

    it.each(commands)('%s is not sent while not connected', async (command) => {
      const { connection, store } = setup();
      connection.setState('reconnecting');

      const result = await store[command]();

      expect(connection.calls).not.toContain(command);
      expect(result).toEqual({ success: false, error: 'client.offline', changed: false });
    });

    it.each(commands)('%s turns a failed call into a result instead of rejecting', async (command) => {
      const { connection, store } = connected();
      connection.answers[command] = new Error('Hub method refused');

      const result = await store[command]();

      expect(result).toEqual({ success: false, error: 'client.failed', changed: false });
    });
  });
});
