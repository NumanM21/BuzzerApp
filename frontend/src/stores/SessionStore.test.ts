import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { SessionApi } from '@/api/SessionApi';
import type { Me } from '@/api/types';
import { deferred, type Deferred } from '@/test/deferred';
import { FakeSessionApi } from '@/test/fakes/FakeSessionApi';
import { makeAdminMe, makeMe } from '@/test/factories';
import { SessionStore } from './SessionStore';

const registration = { joinCode: 'AB12', realName: 'Real Name', displayName: 'Nick', pin: '1234', teamId: 2 };
const credentials = { joinCode: 'AB12', realName: 'Real Name', pin: '1234' };
const networkError = ApiError.network();

function setup() {
  const api = new FakeSessionApi();
  const store = new SessionStore(api);
  return { api, store };
}

describe('SessionStore', () => {
  it('starts unknown, with nobody', () => {
    const { store } = setup();

    expect(store.status).toBe('unknown');
    expect(store.me).toBeUndefined();
    expect(store.isAdmin).toBe(false);
  });

  describe('restore', () => {
    it('signs in whoever the cookie belongs to', async () => {
      const { api, store } = setup();
      api.me = makeMe({ playerId: 4 });

      await store.restore();

      expect(store.status).toBe('signedIn');
      expect(store.me).toEqual(makeMe({ playerId: 4 }));
    });

    it('reads an admin', async () => {
      const { api, store } = setup();
      api.me = makeAdminMe();

      await store.restore();

      expect(store.isAdmin).toBe(true);
    });

    it('is anonymous when the server says 401', async () => {
      const { store } = setup();

      await store.restore();

      expect(store.status).toBe('anonymous');
      expect(store.me).toBeUndefined();
      expect(store.error).toBeUndefined();
    });

    it('stays unknown, with the error, when the server cannot be reached', async () => {
      const { api, store } = setup();
      api.failNext(networkError);

      await store.restore();

      expect(store.status).toBe('unknown');
      expect(store.error).toBe(networkError);
    });

    it('clears that error when a later restore gets an answer', async () => {
      const { api, store } = setup();
      api.failNext(networkError);
      await store.restore();
      api.me = makeMe();

      await store.restore();

      expect(store.status).toBe('signedIn');
      expect(store.error).toBeUndefined();
    });

    it('never rejects', async () => {
      const { api, store } = setup();
      api.failNext(new Error('boom'));

      await expect(store.restore()).resolves.toBeUndefined();
    });

    it('does not undo a sign-in that happened while it was waiting', async () => {
      const slowMe: Deferred<Me> = deferred();
      const api: SessionApi = {
        getMe: () => slowMe.promise,
        register: () => Promise.resolve(makeMe({ playerId: 9 })),
        signIn: () => Promise.resolve(makeMe({ playerId: 9 })),
        signOut: () => Promise.resolve(),
      };
      const store = new SessionStore(api);
      const restoring = store.restore();

      await store.signIn(credentials);
      slowMe.reject(new ApiError({ status: 401, kind: 'unauthorized' }));
      await restoring;

      expect(store.status).toBe('signedIn');
      expect(store.me?.playerId).toBe(9);
    });
  });

  describe('register and signIn', () => {
    it('register signs in the new player', async () => {
      const { store } = setup();

      await store.register(registration);

      expect(store.status).toBe('signedIn');
      expect(store.me).toMatchObject({ realName: 'Real Name', displayName: 'Nick', teamId: 2 });
    });

    it('signIn signs in a known player', async () => {
      const { api, store } = setup();
      api.accounts = [makeMe({ realName: 'Real Name' })];

      await store.signIn(credentials);

      expect(store.status).toBe('signedIn');
      expect(store.me?.realName).toBe('Real Name');
    });

    it('rethrows the ApiError of a wrong name or PIN, and stays anonymous', async () => {
      const { store } = setup();
      await store.restore();

      const failure = store.signIn(credentials);

      await expect(failure).rejects.toMatchObject({ kind: 'unauthorized', message: 'Real name or PIN is incorrect.' });
      expect(store.status).toBe('anonymous');
    });

    it('rethrows the ApiError of a failed registration', async () => {
      const { api, store } = setup();
      const conflict = new ApiError({ status: 409, kind: 'conflict', detail: 'That name is taken.' });
      api.failNext(conflict);

      await expect(store.register(registration)).rejects.toBe(conflict);
      expect(store.me).toBeUndefined();
    });
  });

  describe('signOut', () => {
    it('forgets the player', async () => {
      const { api, store } = setup();
      api.me = makeMe();
      await store.restore();

      await store.signOut();

      expect(store.status).toBe('anonymous');
      expect(store.me).toBeUndefined();
      expect(api.me).toBeUndefined();
    });

    it('counts a 401 as done: the session had already ended', async () => {
      const { api, store } = setup();
      api.me = makeMe();
      await store.restore();
      api.failNext(new ApiError({ status: 401, kind: 'unauthorized' }));

      await store.signOut();

      expect(store.status).toBe('anonymous');
    });

    it('rethrows any other failure and stays signed in', async () => {
      const { api, store } = setup();
      api.me = makeMe();
      await store.restore();
      api.failNext(networkError);

      await expect(store.signOut()).rejects.toBe(networkError);
      expect(store.status).toBe('signedIn');
      expect(store.me).toEqual(api.me);
    });
  });

  describe('refresh', () => {
    it('takes the current names, team and role from the server', async () => {
      const { api, store } = setup();
      api.me = makeMe({ displayName: 'Old', teamId: 1 });
      await store.restore();
      api.me = makeMe({ displayName: 'New', teamId: 2, teamName: 'Team 2' });

      await store.refresh();

      expect(store.me).toMatchObject({ displayName: 'New', teamId: 2 });
    });

    it('signs out when the session has ended', async () => {
      const { api, store } = setup();
      api.me = makeMe();
      await store.restore();
      api.me = undefined;

      await store.refresh();

      expect(store.status).toBe('anonymous');
    });

    it('keeps what it knows when the server cannot be reached, and does not reject', async () => {
      const { api, store } = setup();
      api.me = makeMe();
      await store.restore();
      api.failNext(networkError);

      await expect(store.refresh()).resolves.toBeUndefined();

      expect(store.status).toBe('signedIn');
      expect(store.me).toEqual(makeMe());
    });

    it('lets the later of two overlapping refreshes win', async () => {
      const calls: Deferred<Me>[] = [];
      const api: SessionApi = {
        getMe: () => {
          const call = deferred<Me>();
          calls.push(call);
          return call.promise;
        },
        register: () => Promise.reject(new Error('unused')),
        signIn: () => Promise.reject(new Error('unused')),
        signOut: () => Promise.resolve(),
      };
      const store = new SessionStore(api);

      const first = store.refresh();
      const second = store.refresh();
      calls[1].resolve(makeMe({ displayName: 'Newer' }));
      await second;
      calls[0].resolve(makeMe({ displayName: 'Older' }));
      await first;

      expect(store.me?.displayName).toBe('Newer');
    });
  });

  describe('handleSessionExpired', () => {
    it('signs the player out', async () => {
      const { api, store } = setup();
      api.me = makeMe();
      await store.restore();

      store.handleSessionExpired();

      expect(store.status).toBe('anonymous');
      expect(store.me).toBeUndefined();
    });
  });
});
