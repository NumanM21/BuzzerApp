import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { appPaths } from '@/domain/paths';
import type { RouteAccess } from '@/domain/routeAccess';
import { deferred } from '@/test/deferred';
import { makeAdminMe, makeMe } from '@/test/factories';
import { createTestFakes, createTestServices } from '@/test/testServices';
import { RouteGuardViewModel } from './RouteGuardViewModel';

// The rules themselves are covered case by case in `routeAccess.test.ts`; this checks the view model follows the
// session store as it changes.
function create(access: RouteAccess) {
  const fakes = createTestFakes();
  const services = createTestServices({}, fakes);
  return { vm: new RouteGuardViewModel(services.session, services.event, access), fakes, services };
}

describe('RouteGuardViewModel', () => {
  it('waits until the session is known, then lets a player into a signed-in route', async () => {
    const { vm, fakes, services } = create('signedIn');
    fakes.sessionApi.me = makeMe();
    expect(vm.decision).toEqual({ kind: 'wait' });

    await services.session.restore();

    expect(vm.decision).toEqual({ kind: 'allow' });
  });

  it('sends a person with no session to the join screen', async () => {
    const { vm, services } = create('signedIn');

    await services.session.restore();

    expect(vm.decision).toEqual({ kind: 'redirect', to: appPaths.join });
  });

  it('follows the session when it changes: signing out sends a guarded screen to the join screen', async () => {
    const { vm, fakes, services } = create('player');
    fakes.sessionApi.me = makeMe();
    await services.session.restore();
    expect(vm.decision).toEqual({ kind: 'allow' });

    await services.session.signOut();

    expect(vm.decision).toEqual({ kind: 'redirect', to: appPaths.join });
  });

  it('sends an admin away from the player screen to the host screen', async () => {
    const { vm, fakes, services } = create('player');
    fakes.sessionApi.me = makeAdminMe();

    await services.session.restore();

    expect(vm.decision).toEqual({ kind: 'redirect', to: appPaths.adminHost });
  });

  it('keeps waiting, and says why, when the server cannot be reached', async () => {
    const { vm, fakes, services } = create('signedIn');
    fakes.sessionApi.failNext(ApiError.network());

    await services.session.restore();

    expect(vm.decision).toEqual({ kind: 'wait' });
    expect(vm.unreachableMessage).toBe(ApiError.network().message);
  });

  it('retries the session check, and lets a signed-in person in once the server answers', async () => {
    const { vm, fakes, services } = create('signedIn');
    fakes.sessionApi.me = makeMe();
    fakes.sessionApi.failNext(ApiError.network());
    await services.session.restore();

    await vm.retry();

    expect(vm.decision).toEqual({ kind: 'allow' });
    expect(vm.unreachableMessage).toBeUndefined();
  });

  it('retries the event too when it could not be loaded, so the app gets its name and theme without a reload', async () => {
    const { vm, fakes, services } = create('signedIn');
    fakes.sessionApi.me = makeMe();
    // The server is down when the app opens: both start-up calls fail.
    fakes.eventApi.failNext(ApiError.network());
    await services.event.ensureLoaded();
    fakes.sessionApi.failNext(ApiError.network());
    await services.session.restore();
    expect(services.event.event).toBeUndefined();

    await vm.retry();

    expect(services.event.event).toEqual(fakes.eventApi.event);
    expect(vm.decision).toEqual({ kind: 'allow' });
  });

  it('does not ask for the event again when it is already known', async () => {
    const { vm, fakes, services } = create('signedIn');
    await services.event.ensureLoaded();
    fakes.sessionApi.failNext(ApiError.network());
    await services.session.restore();
    fakes.eventApi.clearCalls();

    await vm.retry();

    expect(fakes.eventApi.calls).toEqual([]);
  });

  it('shows the retry as running, and ignores a second tap meanwhile', async () => {
    const { vm, fakes, services } = create('signedIn');
    fakes.sessionApi.failNext(ApiError.network());
    await services.session.restore();
    const pending = deferred<ReturnType<typeof makeMe>>();
    fakes.sessionApi.getMe = () => pending.promise;
    fakes.sessionApi.clearCalls();

    const first = vm.retry();
    const second = vm.retry();
    expect(vm.isRetrying).toBe(true);
    pending.resolve(makeMe());
    await Promise.all([first, second]);

    expect(vm.isRetrying).toBe(false);
    expect(vm.decision).toEqual({ kind: 'allow' });
  });
});
