import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { ROUND_RUNNING_NOTE } from '@/domain/text';
import { createTeamsScenario } from '@/test/teamsScenario';
import { RenameTeamViewModel } from './RenameTeamViewModel';

async function setup(isRoundRunning = false) {
  const scenario = await createTeamsScenario({ viewer: 'admin' });
  const close = vi.fn();
  const vm = new RenameTeamViewModel({ id: 2, name: 'Team 2' }, scenario.services.teams, () => isRoundRunning, close);
  return { ...scenario, vm, close };
}

describe('RenameTeamViewModel', () => {
  it('starts with the current name', async () => {
    const { vm } = await setup();

    expect(vm.name).toBe('Team 2');
    expect(vm.currentName).toBe('Team 2');
  });

  it('renames the team with the trimmed name, reloads and closes', async () => {
    const { vm, close, fakes, services } = await setup();

    vm.setName('  New Name ');
    await vm.submit();

    expect(fakes.teamsApi.calls).toContain('renameTeam');
    expect(services.teams.teams.value?.find((team) => team.id === 2)?.name).toBe('New Name');
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes without a request when the name is unchanged', async () => {
    const { vm, close, fakes } = await setup();
    fakes.teamsApi.clearCalls();

    vm.setName(' Team 2 ');
    await vm.submit();

    expect(fakes.teamsApi.calls).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ['too short', 'a'],
    ['empty', '   '],
    ['too long', 'a'.repeat(25)],
  ])('refuses a name that is %s', async (_, name) => {
    const { vm, close, fakes } = await setup();
    fakes.teamsApi.clearCalls();

    vm.setName(name);
    await vm.submit();

    expect(vm.form.fieldErrors.name).toBe('Use 2 to 24 characters');
    expect(fakes.teamsApi.calls).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  });

  it('accepts the longest allowed name', async () => {
    const { vm, close } = await setup();

    vm.setName('a'.repeat(24));
    await vm.submit();

    expect(close).toHaveBeenCalledOnce();
  });

  it('puts the server text for a name already in use on the name field', async () => {
    const { vm, close, fakes } = await setup();
    fakes.teamsApi.failNext(new ApiError({ status: 409, kind: 'conflict', detail: 'A team with that name already exists.' }));

    vm.setName('Team 1');
    await vm.submit();

    expect(vm.form.fieldErrors).toEqual({ name: 'A team with that name already exists.' });
    expect(close).not.toHaveBeenCalled();
  });

  it('shows a lost connection on the form', async () => {
    const { vm, fakes } = await setup();
    fakes.teamsApi.failNext(ApiError.network());

    vm.setName('Another');
    await vm.submit();

    expect(vm.form.formError).toBe(ApiError.network().message);
  });

  it('notes a running round', async () => {
    expect((await setup(true)).vm.roundNote).toBe(ROUND_RUNNING_NOTE);
    expect((await setup(false)).vm.roundNote).toBeUndefined();
  });
});
