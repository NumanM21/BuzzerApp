import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { PackKeys } from '@/domain/themeCatalog';
import { makePackKeys } from '@/test/fakes/FakeThemeCatalog';
import { createTeamsScenario } from '@/test/teamsScenario';
import { AddTeamViewModel } from './AddTeamViewModel';

// The factory teams use `color-1`…`color-n`, so a pack with `color-1`…`color-k` has k - n colours free.
async function setup(teamCount: number, packColors: number, packIcons = 3) {
  const scenario = await createTeamsScenario({ viewer: 'admin', teamCount, membersPerTeam: 0 });
  const close = vi.fn();
  let keys: PackKeys | undefined = makePackKeys(packColors, packIcons);
  const vm = new AddTeamViewModel(scenario.services.teams, () => keys, close);
  return { ...scenario, vm, close, setKeys: (next: PackKeys | undefined) => (keys = next) };
}

describe('AddTeamViewModel', () => {
  describe('the colours on offer', () => {
    it.each([
      [0, 4, ['color-1', 'color-2', 'color-3', 'color-4']],
      [2, 4, ['color-3', 'color-4']],
      [3, 4, ['color-4']],
      [4, 4, []],
    ])('with %i teams and a pack of %i colours', async (teamCount, packColors, expected) => {
      const { vm } = await setup(teamCount, packColors);

      expect(vm.colorKeys).toEqual(expected);
      expect(vm.noFreeColor).toBe(expected.length === 0);
    });

    it('offers every icon of the pack, even ones teams already use', async () => {
      const { vm } = await setup(2, 4, 5);

      expect(vm.iconKeys).toEqual(['icon-1', 'icon-2', 'icon-3', 'icon-4', 'icon-5']);
    });

    it('is loading, not "no free colour", until the pack keys arrive', async () => {
      const { vm, setKeys } = await setup(1, 3);
      setKeys(undefined);

      expect(vm.isLoadingKeys).toBe(true);
      expect(vm.noFreeColor).toBe(false);
    });
  });

  describe('the choice', () => {
    it('starts on the first free colour and the first icon', async () => {
      const { vm } = await setup(2, 4);

      expect(vm.selectedColorKey).toBe('color-3');
      expect(vm.selectedIconKey).toBe('icon-1');
    });

    it('keeps what was chosen', async () => {
      const { vm } = await setup(2, 4);

      vm.selectColor('color-4');
      vm.selectIcon('icon-2');

      expect(vm.selectedColorKey).toBe('color-4');
      expect(vm.selectedIconKey).toBe('icon-2');
    });

    it('moves to a free colour when the chosen one gets taken meanwhile', async () => {
      const { vm, fakes, services } = await setup(2, 4);
      vm.selectColor('color-3');

      await fakes.teamsApi.createTeam({ name: 'Other', colorKey: 'color-3', iconKey: 'icon-1' });
      await services.teams.teams.load();

      expect(vm.selectedColorKey).toBe('color-4');
    });
  });

  describe('submitting', () => {
    it('creates the team with the trimmed name and the chosen keys, then closes', async () => {
      const { vm, close, fakes } = await setup(2, 4);
      const create = vi.spyOn(fakes.teamsApi, 'createTeam');

      vm.setName('  Newcomers ');
      vm.selectColor('color-4');
      vm.selectIcon('icon-3');
      await vm.submit();

      expect(create).toHaveBeenCalledWith({ name: 'Newcomers', colorKey: 'color-4', iconKey: 'icon-3' });
      expect(close).toHaveBeenCalledOnce();
    });

    it.each([
      ['empty', ''],
      ['one character', 'a'],
      ['over the longest', 'a'.repeat(25)],
    ])('refuses a name that is %s and sends nothing', async (_, name) => {
      const { vm, close, fakes } = await setup(2, 4);
      fakes.teamsApi.clearCalls();

      vm.setName(name);
      await vm.submit();

      expect(vm.form.fieldErrors.name).toBe('Use 2 to 24 characters');
      expect(fakes.teamsApi.calls).toEqual([]);
      expect(close).not.toHaveBeenCalled();
    });

    it('says every colour is used when none is free', async () => {
      const { vm, close, fakes } = await setup(3, 3);
      fakes.teamsApi.clearCalls();

      vm.setName('Newcomers');
      await vm.submit();

      expect(vm.form.fieldErrors.colorKey).toBe('Every colour is already used by a team');
      expect(fakes.teamsApi.calls).toEqual([]);
      expect(close).not.toHaveBeenCalled();
    });

    it('puts a colour clash on the colour and a name clash on the name', async () => {
      const { vm, fakes } = await setup(2, 4);
      vm.setName('Newcomers');

      fakes.teamsApi.failNext(new ApiError({ status: 409, kind: 'conflict', detail: 'Another team already uses that colour.' }));
      await vm.submit();
      expect(vm.form.fieldErrors).toEqual({ colorKey: 'Another team already uses that colour.' });

      fakes.teamsApi.failNext(new ApiError({ status: 409, kind: 'conflict', detail: 'A team with that name already exists.' }));
      await vm.submit();
      expect(vm.form.fieldErrors).toEqual({ name: 'A team with that name already exists.' });
    });

    it('works with a pack of one colour and one icon', async () => {
      const { vm, close } = await setup(0, 1, 1);

      vm.setName('Solo');
      await vm.submit();

      expect(close).toHaveBeenCalledOnce();
    });
  });
});
