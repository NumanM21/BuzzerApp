import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { createTeamsScenario } from '@/test/teamsScenario';
import { MakeAdminViewModel } from './MakeAdminViewModel';

async function setup() {
  const scenario = await createTeamsScenario({ viewer: 'admin' });
  const close = vi.fn();
  const vm = new MakeAdminViewModel(
    { playerId: 1, displayName: 'Player 1', teamName: 'Team 1' },
    scenario.services.teams,
    close,
  );
  return { ...scenario, vm, close };
}

describe('MakeAdminViewModel', () => {
  it('exposes who is being promoted and the team they leave', async () => {
    const { vm } = await setup();

    expect(vm.subjectName).toBe('Player 1');
    expect(vm.teamName).toBe('Team 1');
  });

  it('promotes the player, reloads the teams and closes', async () => {
    const { vm, close, fakes } = await setup();
    fakes.teamsApi.clearCalls();
    const promote = vi.spyOn(fakes.playersApi, 'promotePlayer');

    await vm.submit();

    expect(promote).toHaveBeenCalledWith(1);
    expect(fakes.teamsApi.calls).toContain('getTeams');
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows a failure and stays open', async () => {
    const { vm, close, fakes } = await setup();
    fakes.playersApi.failNext(new ApiError({ status: 404, kind: 'notFound', detail: 'That player no longer exists.' }));

    await vm.submit();

    expect(vm.form.formError).toBe('That player no longer exists.');
    expect(close).not.toHaveBeenCalled();
  });

  it('closes on cancel without calling the server', async () => {
    const { vm, close, fakes } = await setup();
    fakes.playersApi.clearCalls();

    vm.cancel();

    expect(close).toHaveBeenCalledOnce();
    expect(fakes.playersApi.calls).toEqual([]);
  });
});
