import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { EventInfo } from '@/api/types';
import { deferred } from '@/test/deferred';
import { flushPromises } from '@/test/flushPromises';
import { FakeEventApi } from '@/test/fakes/FakeEventApi';
import { FakeSessionApi } from '@/test/fakes/FakeSessionApi';
import { makeEventInfo, makeMe } from '@/test/factories';
import { EventStore } from '@/stores/EventStore';
import { SessionStore } from '@/stores/SessionStore';
import { DEFAULT_THEME_KEY } from '@/theme/registry';
import { AppViewModel } from './AppViewModel';

function setup() {
  const eventApi = new FakeEventApi();
  const sessionApi = new FakeSessionApi();
  const event = new EventStore(eventApi);
  const session = new SessionStore(sessionApi);
  return { eventApi, sessionApi, session, vm: new AppViewModel(event, session) };
}

describe('AppViewModel', () => {
  it('is not ready before the event is known, so the default theme never flashes first', () => {
    const { vm } = setup();

    expect(vm.isReady).toBe(false);
  });

  it('is ready with the event\'s theme once the event has loaded', async () => {
    const { eventApi, vm } = setup();
    const slow = deferred<EventInfo>();
    eventApi.getEvent = () => slow.promise;

    vm.activate();
    expect(vm.isReady).toBe(false);
    slow.resolve(makeEventInfo({ themeKey: 'some-pack' }));
    await flushPromises();

    expect(vm.isReady).toBe(true);
    expect(vm.themeKey).toBe('some-pack');
  });

  it('is ready with the default theme when the event cannot be loaded', async () => {
    const { eventApi, vm } = setup();
    eventApi.failNext(ApiError.network());

    vm.activate();
    await flushPromises();

    expect(vm.isReady).toBe(true);
    expect(vm.themeKey).toBe(DEFAULT_THEME_KEY);
  });

  it('also asks who this phone is', async () => {
    const { sessionApi, session, vm } = setup();
    sessionApi.me = makeMe();

    vm.activate();
    await flushPromises();

    expect(session.status).toBe('signedIn');
  });

  it('asks for the event once however often it is activated (StrictMode activates twice)', async () => {
    const { eventApi, vm } = setup();

    vm.activate();
    vm.activate();
    await flushPromises();

    expect(eventApi.calls).toEqual(['getEvent']);
  });
});
