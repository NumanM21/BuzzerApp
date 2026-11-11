import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { ROUND_RUNNING_NOTE } from '@/domain/text';
import { createTeamsScenario } from '@/test/teamsScenario';
import { MovePlayerViewModel } from './MovePlayerViewModel';

async function setup(teamCount = 3, isRoundRunning = false) {
  const scenario = await createTeamsScenario({ viewer: 'admin', teamCount });
  const close = vi.fn();
  // Player 1 is the first member of team 1.
  const vm = new MovePlayerViewModel(
    { playerId: 1, displayName: 'Player 1', teamId: 1 },
    scenario.services.teams,
    () => isRoundRunning,
    close,
  );
  return { ...scenario, vm, close };
}

describe('MovePlayerViewModel', () => {
  it.each([2, 3, 6, 13])('offers the other teams only, in the server order, with %i teams', async (teamCount) => {
    const { vm } = await setup(teamCount);

    expect(vm.options.map((option) => option.id)).toEqual(Array.from({ length: teamCount - 1 }, (_, i) => i + 2));
    expect(vm.options[0]).toMatchObject({ name: 'Team 2', detail: '2 players' });
  });

  it('offers nothing when there is only one team', async () => {
    const { vm } = await setup(1);

    expect(vm.options).toEqual([]);
  });

  it('asks for a team before moving', async () => {
    const { vm, close, fakes } = await setup();
    fakes.playersApi.clearCalls();

    await vm.submit();

    expect(vm.form.fieldErrors.teamId).toBe('Pick a team to move to');
    expect(fakes.playersApi.calls).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  });

  it('moves the player to the chosen team and closes', async () => {
    const { vm, close, fakes } = await setup();
    const move = vi.spyOn(fakes.playersApi, 'movePlayer');

    vm.select(3);
    await vm.submit();

    expect(move).toHaveBeenCalledWith(1, 3);
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows what the server refused with on the form and stays open', async () => {
    const { vm, close, fakes } = await setup();
    fakes.playersApi.failNext(new ApiError({ status: 404, kind: 'notFound', detail: 'That player no longer exists.' }));

    vm.select(2);
    await vm.submit();

    expect(vm.form.formError).toBe('That player no longer exists.');
    expect(close).not.toHaveBeenCalled();
  });

  it('puts a 400 about the team on the team choice', async () => {
    const { vm, fakes } = await setup();
    fakes.playersApi.failNext(new ApiError({ status: 400, kind: 'validation', fieldErrors: { teamId: ['No such team.'] } }));

    vm.select(2);
    await vm.submit();

    expect(vm.form.fieldErrors.teamId).toBe('No such team.');
  });

  it('notes a running round', async () => {
    expect((await setup(3, true)).vm.roundNote).toBe(ROUND_RUNNING_NOTE);
    expect((await setup(3, false)).vm.roundNote).toBeUndefined();
  });
});
