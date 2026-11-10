import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { FakeEventApi } from '@/test/fakes/FakeEventApi';
import { makeEventInfo } from '@/test/factories';
import { EventStore } from './EventStore';

function setup() {
  const api = new FakeEventApi();
  return { api, store: new EventStore(api) };
}

describe('EventStore', () => {
  it('knows nothing until it is loaded', () => {
    const { store } = setup();

    expect(store.event).toBeUndefined();
    expect(store.themeKey).toBeUndefined();
    expect(store.isSettled).toBe(false);
  });

  it('exposes the active event and its theme key once loaded', async () => {
    const { api, store } = setup();
    api.event = makeEventInfo({ name: 'Games Night', year: 2031, themeKey: 'some-pack' });

    await store.load();

    expect(store.event).toEqual({ name: 'Games Night', year: 2031, themeKey: 'some-pack' });
    expect(store.themeKey).toBe('some-pack');
    expect(store.isSettled).toBe(true);
  });

  it('is settled after a failed load, with the error and no theme', async () => {
    const { api, store } = setup();
    const noEvent = new ApiError({ status: 404, kind: 'notFound' });
    api.failNext(noEvent);

    await store.load();

    expect(store.isSettled).toBe(true);
    expect(store.error).toBe(noEvent);
    expect(store.themeKey).toBeUndefined();
  });

  it('stays settled while a retry after an error runs', async () => {
    const { api, store } = setup();
    api.failNext(ApiError.network());
    await store.load();

    const retry = store.load();

    expect(store.isSettled).toBe(true);
    await retry;
    expect(store.event).toBeDefined();
    expect(store.error).toBeUndefined();
  });

  it('ensureLoaded asks the server once', async () => {
    const { api, store } = setup();

    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    await store.ensureLoaded();

    expect(api.calls).toEqual(['getEvent']);
  });
});
