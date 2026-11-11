import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { createTeamsScenario } from '@/test/teamsScenario';
import { DeleteTeamViewModel } from './DeleteTeamViewModel';

async function setup(membersPerTeam: number) {
  const scenario = await createTeamsScenario({ viewer: 'admin', teamCount: 3, membersPerTeam });
  const close = vi.fn();
  const vm = new DeleteTeamViewModel({ id: 3, name: 'Team 3' }, scenario.services.teams, close);
  return { ...scenario, vm, close };
}

describe('DeleteTeamViewModel', () => {
  it('deletes an empty team, reloads and closes', async () => {
    const { vm, close, services } = await setup(0);

    await vm.submit();

    expect(services.teams.teams.value?.map((team) => team.id)).toEqual([1, 2]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows the server text when the team cannot be deleted, and stays open', async () => {
    // The fake refuses a team with members the way the server refuses one with players, scores or history.
    const { vm, close, services } = await setup(2);

    await vm.submit();

    expect(vm.form.formError).toBe('The team still has players.');
    expect(close).not.toHaveBeenCalled();
    expect(services.teams.teams.value).toHaveLength(3);
  });

  it('can be tried again after a refusal', async () => {
    const { vm, close, fakes } = await setup(0);
    fakes.teamsApi.failNext(ApiError.network());

    await vm.submit();
    expect(vm.form.formError).toBeDefined();
    await vm.submit();

    expect(vm.form.formError).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it('exposes the team name for the question', async () => {
    const { vm } = await setup(0);

    expect(vm.teamName).toBe('Team 3');
  });
});
