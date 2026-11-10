import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { appPaths } from '@/domain/paths';
import { makeAdminMe, makeMe } from '@/test/factories';
import { createTestFakes, createTestServices } from '@/test/testServices';
import { ShellViewModel } from './ShellViewModel';

async function createSignedIn(me = makeMe()) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  const services = createTestServices({}, fakes);
  await Promise.all([services.session.restore(), services.event.load()]);
  return { vm: new ShellViewModel(services.event, services.session), fakes, services };
}

describe('ShellViewModel', () => {
  it('shows the event name and the person\'s display name, never the real name', async () => {
    const { vm } = await createSignedIn(makeMe({ displayName: 'Nick', realName: 'Real Person' }));

    expect(vm.eventName).toBe('Games Night');
    expect(vm.displayName).toBe('Nick');
  });

  it('has no event name when the event could not be loaded', () => {
    const fakes = createTestFakes();
    const services = createTestServices({}, fakes);

    expect(new ShellViewModel(services.event, services.session).eventName).toBe('');
  });

  it('offers a player Buzz, Teams and Scores', async () => {
    const { vm } = await createSignedIn(makeMe());

    expect(vm.navItems.map((item) => item.label)).toEqual(['Buzz', 'Teams', 'Scores']);
  });

  it('offers an admin Host, Teams, Scores and Event', async () => {
    const { vm } = await createSignedIn(makeAdminMe());

    expect(vm.navItems.map((item) => item.path)).toEqual([
      appPaths.adminHost,
      appPaths.teams,
      appPaths.adminScores,
      appPaths.adminEvent,
    ]);
  });

  it('shows no navigation for nobody', () => {
    const services = createTestServices();

    expect(new ShellViewModel(services.event, services.session).navItems).toEqual([]);
  });

  it('signs out through the server and leaves the session anonymous', async () => {
    const { vm, fakes, services } = await createSignedIn();

    await vm.signOut();

    expect(fakes.sessionApi.calls).toContain('signOut');
    expect(services.session.status).toBe('anonymous');
    expect(vm.signOutError).toBeUndefined();
  });

  it('stays signed in and says why when the server cannot be reached', async () => {
    const { vm, fakes, services } = await createSignedIn();
    fakes.sessionApi.failNext(ApiError.network());

    await vm.signOut();

    expect(services.session.status).toBe('signedIn');
    expect(vm.signOutError).toBe(ApiError.network().message);
    expect(vm.isSigningOut).toBe(false);
  });
});
