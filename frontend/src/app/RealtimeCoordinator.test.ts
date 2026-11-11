import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { Me } from '@/api/types';
import { flushPromises } from '@/test/flushPromises';
import { makeAdminMe, makeAdminSnapshot, makeMe, makePublicSnapshot, makeTeams } from '@/test/factories';
import { FakePageVisibility } from '@/test/fakes/FakePageVisibility';
import { createTestFakes, createTestServices } from '@/test/testServices';
import { RealtimeCoordinator } from './RealtimeCoordinator';

const coordinators: RealtimeCoordinator[] = [];

afterEach(() => {
  coordinators.forEach((coordinator) => coordinator.dispose());
  coordinators.length = 0;
});

/** The real stores over fakes, with the coordinator running. `me` is who the session cookie belongs to. */
async function setup(me: Me | undefined) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  const services = createTestServices({}, fakes);
  const visibility = new FakePageVisibility();
  const coordinator = new RealtimeCoordinator(fakes.connection, services.session, services.round, visibility);
  coordinators.push(coordinator);
  coordinator.start();
  await services.session.restore();
  return { fakes, services, visibility, coordinator, connection: fakes.connection };
}

describe('RealtimeCoordinator', () => {
  describe('rule 1: connected only while signed in', () => {
    it('starts the connection when the session is restored as signed in', async () => {
      const { connection } = await setup(makeMe());

      expect(connection.calls).toEqual(['start']);
    });

    it('does not connect while nobody is signed in', async () => {
      const { connection } = await setup(undefined);

      expect(connection.calls).toEqual([]);
    });

    it('starts the connection on sign-in', async () => {
      const { fakes, services, connection } = await setup(undefined);
      fakes.sessionApi.accounts = [makeMe({ realName: 'Someone' })];

      await services.session.signIn({ joinCode: 'AB12', realName: 'Someone', pin: '1234' });

      expect(connection.calls).toEqual(['start']);
    });

    it.each<[string, (services: Awaited<ReturnType<typeof setup>>['services']) => Promise<void> | void]>([
      ['signing out', (services) => services.session.signOut()],
      ['the session ending', (services) => services.session.handleSessionExpired()],
    ])('stops the connection and forgets the round on %s', async (_, end) => {
      const { services, connection } = await setup(makeAdminMe());
      connection.connect();
      connection.emitRoundUpdated(makePublicSnapshot({ version: 3, phase: 'open' }));
      connection.emitAdminRoundUpdated(makeAdminSnapshot({ version: 3, phase: 'open' }));

      await end(services);

      expect(connection.calls).toEqual(['start', 'stop']);
      expect(connection.state).toBe('disconnected');
      expect(services.round.publicSnapshot).toBeUndefined();
      expect(services.round.adminSnapshot).toBeUndefined();
    });
  });

  describe('rule 2: a new identity is a new connection', () => {
    it('restarts the connection when a player is made an admin', async () => {
      const { fakes, services, connection } = await setup(makeMe({ playerId: 4 }));
      connection.connect();
      connection.emitRoundUpdated(makePublicSnapshot({ version: 12, phase: 'open' }));
      connection.clearCalls();

      fakes.sessionApi.me = makeAdminMe({ playerId: 4 });
      await services.session.refresh();

      expect(connection.calls).toEqual(['stop', 'start']);
      expect(services.round.publicSnapshot).toBeUndefined();
    });

    it('keeps the connection when only names or the team changed', async () => {
      const { fakes, services, connection } = await setup(makeMe({ playerId: 4, teamId: 1 }));
      connection.connect();
      connection.clearCalls();

      fakes.sessionApi.me = makeMe({ playerId: 4, teamId: 2, teamName: 'Team 2', displayName: 'Renamed' });
      await services.session.refresh();

      expect(connection.calls).toEqual([]);
    });
  });

  // The teams store re-reads the session on `onReconnected` as well, so these tests change only the connection's
  // state: what they see is the coordinator's own call.
  describe('rule 6: after every (re)connect', () => {
    it('re-reads the session', async () => {
      const { fakes, connection } = await setup(makeMe());
      fakes.sessionApi.clearCalls();

      connection.setState('connected');
      await flushPromises();

      expect(fakes.sessionApi.calls).toEqual(['getMe']);
    });

    it('also after SignalR reconnects by itself', async () => {
      const { fakes, connection } = await setup(makeMe());
      connection.setState('connected');
      connection.drop();
      await flushPromises();
      fakes.sessionApi.clearCalls();

      connection.setState('connected');
      await flushPromises();

      expect(fakes.sessionApi.calls).toEqual(['getMe']);
    });

    it('lets the stores reload what they show', async () => {
      const { fakes, services, connection } = await setup(makeMe());
      fakes.teamsApi.teams = makeTeams(2);
      await services.teams.teams.ensureLoaded();
      fakes.teamsApi.clearCalls();

      connection.connect();
      await flushPromises();

      expect(fakes.teamsApi.calls).toEqual(['getTeams']);
    });

    it('signs out (and disconnects) when the session ended while away', async () => {
      const { fakes, services, connection } = await setup(makeMe());
      fakes.sessionApi.me = undefined;

      connection.setState('connected');
      await flushPromises();

      expect(services.session.status).toBe('anonymous');
      expect(connection.calls).toEqual(['start', 'stop']);
    });
  });

  describe('a connection attempt fails: the session may be what ended', () => {
    it('re-reads the session', async () => {
      const { fakes, connection } = await setup(makeMe());
      fakes.sessionApi.clearCalls();

      connection.failAttempt();
      await flushPromises();

      expect(fakes.sessionApi.calls).toEqual(['getMe']);
    });

    it('signs out (and stops trying) when the session has ended, so the person sees the join screen', async () => {
      const { fakes, services, connection } = await setup(makeMe());
      fakes.sessionApi.me = undefined;

      connection.failAttempt();
      await flushPromises();

      expect(services.session.status).toBe('anonymous');
      expect(connection.calls).toEqual(['start', 'stop']);
    });

    it('keeps the person signed in, and keeps trying, when the server is only unreachable', async () => {
      const { fakes, services, connection } = await setup(makeMe());
      fakes.sessionApi.failNext(ApiError.network());

      connection.failAttempt();
      await flushPromises();

      expect(services.session.status).toBe('signedIn');
      expect(connection.calls).toEqual(['start']);
    });
  });

  describe('rule 7: back in view', () => {
    it('retries the connection at once and re-reads the session', async () => {
      const { fakes, visibility, connection } = await setup(makeMe());
      fakes.sessionApi.clearCalls();

      visibility.becomeVisible();
      await flushPromises();

      expect(connection.calls).toEqual(['start', 'retryNow']);
      expect(fakes.sessionApi.calls).toEqual(['getMe']);
    });

    it('does nothing for someone not signed in', async () => {
      const { fakes, visibility, connection } = await setup(undefined);
      fakes.sessionApi.clearCalls();

      visibility.becomeVisible();
      await flushPromises();

      expect(connection.calls).toEqual([]);
      expect(fakes.sessionApi.calls).toEqual([]);
    });
  });

  it('stops following the session once disposed', async () => {
    const { fakes, services, coordinator, visibility, connection } = await setup(undefined);
    fakes.sessionApi.accounts = [makeMe({ realName: 'Someone' })];

    coordinator.dispose();
    await services.session.signIn({ joinCode: 'AB12', realName: 'Someone', pin: '1234' });
    visibility.becomeVisible();

    expect(connection.calls).toEqual(['stop']);
  });

  it('starts following only once, however often it is started', async () => {
    const { coordinator, connection, services } = await setup(makeMe());

    coordinator.start();
    await services.session.signOut();

    expect(connection.calls).toEqual(['start', 'stop']);
  });
});
