import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { makeAdminMe, makeAdminSnapshot, makeMe, makePublicSnapshot, makeTeamQueue } from '@/test/factories';
import { createTestFakes, createTestServices } from '@/test/testServices';
import { RealtimeDebugViewModel } from './RealtimeDebugViewModel';

async function setup(me: Me | undefined) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  const services = createTestServices({}, fakes);
  await services.session.restore();
  const vm = new RealtimeDebugViewModel(services.round, services.session, services.clock);
  return { fakes, vm, connection: fakes.connection };
}

describe('RealtimeDebugViewModel', () => {
  it('shows nothing yet before the first snapshot', async () => {
    const { vm } = await setup(makeMe());

    expect(vm.connectionState).toBe('disconnected');
    expect(vm.publicSnapshot).toBe('None yet');
    expect(vm.adminSnapshot).toBe('None yet');
    expect(vm.buzzer).toBe('waiting');
  });

  it("describes the player and their buzzer from the snapshot", async () => {
    const { vm, connection } = await setup(makeMe({ displayName: 'Player 3', teamId: 2, teamName: 'Team 2' }));
    connection.setState('connected');

    connection.emitRoundUpdated(makePublicSnapshot({ version: 2, phase: 'open', teamQueue: makeTeamQueue([5, 2]) }));

    expect(vm.connectionState).toBe('connected');
    expect(vm.identity).toBe('Player 3 (player, Team 2)');
    expect(vm.buzzer).toBe('queued, #2, buzzed by Player 20');
    expect(JSON.parse(vm.publicSnapshot)).toMatchObject({ version: 2, phase: 'open' });
  });

  it('offers the buzzer to a player and nothing to an admin, who runs the round from the host screen', async () => {
    const player = await setup(makeMe());
    const admin = await setup(makeAdminMe({ displayName: 'Host' }));

    expect(player.vm.canBuzz).toBe(true);
    expect(admin.vm.canBuzz).toBe(false);
    expect(admin.vm.identity).toBe('Host (admin)');
  });

  it('shows the admin snapshot as it arrives', async () => {
    const { vm, connection } = await setup(makeAdminMe());

    connection.emitAdminRoundUpdated(makeAdminSnapshot({ version: 4, phase: 'locked' }));

    expect(JSON.parse(vm.adminSnapshot)).toMatchObject({ version: 4, buzzes: [] });
  });

  it('says what the server answered when a buzz is refused', async () => {
    const { vm, connection } = await setup(makeMe());
    connection.setState('connected');
    connection.answers.buzz = { success: false, error: 'round.notOpen', changed: false };

    await vm.buzz();

    expect(connection.calls).toContain('buzz');
    expect(vm.lastResult).toBe("Buzz: Buzzing isn't open right now (round.notOpen)");
  });

  it('says when a command worked and changed the round', async () => {
    const { vm, connection } = await setup(makeMe());
    connection.setState('connected');

    await vm.buzz();

    expect(vm.lastResult).toBe('Buzz: done, round changed');
  });
});
