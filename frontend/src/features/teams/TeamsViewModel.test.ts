import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { ROUND_RUNNING_NOTE } from '@/domain/text';
import { flushPromises } from '@/test/flushPromises';
import { createTeamsScenario, startRound, type TeamsScenarioOptions } from '@/test/teamsScenario';
import { TeamsViewModel } from './TeamsViewModel';

async function setup(options: TeamsScenarioOptions = {}) {
  const scenario = await createTeamsScenario(options);
  const { services } = scenario;
  const vm = new TeamsViewModel(services.teams, services.session, services.round, services.event, services.themes);
  return { ...scenario, vm };
}

describe('TeamsViewModel', () => {
  describe('the cards', () => {
    it.each([1, 2, 6, 13])('has one card per team in the server order, with %i teams', async (teamCount) => {
      const { vm } = await setup({ teamCount, membersPerTeam: 2 });

      expect(vm.state).toBe('ready');
      expect(vm.cards.map((card) => card.id)).toEqual(Array.from({ length: teamCount }, (_, i) => i + 1));
    });

    it('carries a team with no members', async () => {
      const { vm } = await setup({ teamCount: 2, membersPerTeam: 0 });

      expect(vm.cards.map((card) => card.members)).toEqual([[], []]);
    });

    it('marks the viewer\'s own row and shows only the real name the server sent', async () => {
      const { vm } = await setup({ viewer: 'player', teamCount: 2, membersPerTeam: 2 });

      const members = vm.cards.flatMap((card) => card.members);
      expect(members.filter((member) => member.isViewer).map((member) => member.id)).toEqual([1]);
      expect(members.filter((member) => member.realName !== null).map((member) => member.id)).toEqual([1]);
    });

    it('shows every real name to an admin, and marks no row (an admin is on no team)', async () => {
      const { vm } = await setup({ viewer: 'admin', teamCount: 2, membersPerTeam: 2 });

      const members = vm.cards.flatMap((card) => card.members);
      expect(members.every((member) => member.realName !== null)).toBe(true);
      expect(members.some((member) => member.isViewer)).toBe(false);
    });

    it('follows a change of the teams without a reload by hand', async () => {
      const { vm, fakes } = await setup({ teamCount: 2 });
      fakes.teamsApi.teams = fakes.teamsApi.teams.map((team) => ({ ...team, name: `${team.name} (renamed)` }));

      fakes.connection.emitTeamsChanged();
      await flushPromises();

      expect(vm.cards[0].name).toBe('Team 1 (renamed)');
    });
  });

  describe('the screen state', () => {
    it('is loading before the teams arrive, then ready', async () => {
      const { vm, services } = await setup();
      services.teams.teams.reset();
      expect(vm.state).toBe('loading');

      vm.activate();
      await flushPromises();

      expect(vm.state).toBe('ready');
    });

    it('is empty with no teams', async () => {
      const { vm, fakes, services } = await setup();
      fakes.teamsApi.teams = [];
      await services.teams.teams.load();

      expect(vm.state).toBe('empty');
    });

    it('is an error when the first load fails, and reload tries again', async () => {
      const { vm, fakes, services } = await setup();
      services.teams.teams.reset();
      fakes.teamsApi.failNext(ApiError.network());

      vm.activate();
      await flushPromises();
      expect(vm.state).toBe('error');
      expect(vm.loadError).toBe(ApiError.network().message);

      vm.reload();
      await flushPromises();
      expect(vm.state).toBe('ready');
      expect(vm.loadError).toBeUndefined();
    });

    it('keeps the cards on screen when a reload fails, and says so', async () => {
      const { vm, fakes, services } = await setup({ teamCount: 3 });
      fakes.teamsApi.failNext(ApiError.network());

      await services.teams.teams.load();

      expect(vm.state).toBe('ready');
      expect(vm.cards).toHaveLength(3);
      expect(vm.loadError).toBe(ApiError.network().message);
    });

    it('loads the teams and the pack keys when activated', async () => {
      const { vm, fakes, services } = await setup();
      services.teams.teams.reset();
      fakes.teamsApi.clearCalls();

      vm.activate();
      await flushPromises();

      expect(fakes.teamsApi.calls).toEqual(['getTeams']);
    });
  });

  describe('what a person may do on a row', () => {
    it('offers a player ✎ on their own row and nothing on anyone else\'s', async () => {
      const { vm } = await setup({ viewer: 'player' });

      expect(vm.memberActions(1)).toBe('editOwnNames');
      expect(vm.memberActions(2)).toBe('none');
    });

    it('offers an admin the menu on every row', async () => {
      const { vm } = await setup({ viewer: 'admin' });

      expect(vm.memberActions(1)).toBe('manage');
      expect(vm.memberActions(2)).toBe('manage');
    });
  });

  describe('opening dialogs', () => {
    it('opens Edit names for a player\'s own row and closes it again', async () => {
      const { vm } = await setup({ viewer: 'player' });

      vm.openEditNames(1);
      expect(vm.dialog?.kind).toBe('editNames');

      vm.closeDialog();
      expect(vm.dialog).toBeUndefined();
    });

    it('prefills the real name from what the server sent', async () => {
      const { vm } = await setup({ viewer: 'player' });

      vm.openEditNames(1);

      expect(vm.dialog?.kind === 'editNames' && vm.dialog.vm.realName).toBe('Real Name 1');
    });

    it('ignores a player asking to edit someone else', async () => {
      const { vm } = await setup({ viewer: 'player' });

      vm.openEditNames(2);

      expect(vm.dialog).toBeUndefined();
    });

    it.each(['openRenameTeam', 'openDeleteTeam'] as const)('ignores a player calling %s', async (opener) => {
      const { vm } = await setup({ viewer: 'player' });

      vm[opener](1);

      expect(vm.dialog).toBeUndefined();
    });

    it.each(['openMovePlayer', 'openMakeAdmin'] as const)('ignores a player calling %s', async (opener) => {
      const { vm } = await setup({ viewer: 'player' });

      vm[opener](1);

      expect(vm.dialog).toBeUndefined();
    });

    it('ignores a player opening Add team', async () => {
      const { vm } = await setup({ viewer: 'player' });

      vm.openAddTeam();

      expect(vm.dialog).toBeUndefined();
    });

    it.each([
      ['openRenameTeam', 'renameTeam'],
      ['openDeleteTeam', 'deleteTeam'],
      ['openEditNames', 'editNames'],
      ['openMovePlayer', 'movePlayer'],
      ['openMakeAdmin', 'makeAdmin'],
    ] as const)('lets an admin open %s', async (opener, kind) => {
      const { vm } = await setup({ viewer: 'admin' });

      vm[opener](1);

      expect(vm.dialog?.kind).toBe(kind);
    });

    it('lets an admin open Add team, which loads the pack keys', async () => {
      const { vm } = await setup({ viewer: 'admin' });

      vm.openAddTeam();
      await flushPromises();

      expect(vm.dialog?.kind === 'addTeam' && vm.dialog.vm.isLoadingKeys).toBe(false);
    });

    it('ignores an id that is no longer on the screen', async () => {
      const { vm } = await setup({ viewer: 'admin' });

      vm.openRenameTeam(999);
      vm.openMovePlayer(999);

      expect(vm.dialog).toBeUndefined();
    });

    it('opens Move for a member with the other teams', async () => {
      const { vm } = await setup({ viewer: 'admin', teamCount: 3 });

      vm.openMovePlayer(1);

      expect(vm.dialog?.kind === 'movePlayer' && vm.dialog.vm.options.map((option) => option.id)).toEqual([2, 3]);
    });

    it('shows one dialog at a time: the newest replaces the last', async () => {
      const { vm } = await setup({ viewer: 'admin' });

      vm.openRenameTeam(1);
      vm.openDeleteTeam(2);

      expect(vm.dialog?.kind).toBe('deleteTeam');
    });
  });

  describe('a dialog and the screen', () => {
    it('closes the dialog when the change was accepted, and the cards show it', async () => {
      const { vm } = await setup({ viewer: 'admin' });
      vm.openRenameTeam(2);
      if (vm.dialog?.kind !== 'renameTeam') {
        throw new Error('Expected the rename dialog');
      }

      vm.dialog.vm.setName('Renamed');
      await vm.dialog.vm.submit();

      expect(vm.dialog).toBeUndefined();
      expect(vm.cards.find((card) => card.id === 2)?.name).toBe('Renamed');
    });

    it('keeps the dialog open when the server refused', async () => {
      const { vm, fakes } = await setup({ viewer: 'admin' });
      vm.openDeleteTeam(1);
      if (vm.dialog?.kind !== 'deleteTeam') {
        throw new Error('Expected the delete dialog');
      }
      fakes.teamsApi.failNext(ApiError.network());

      await vm.dialog.vm.submit();

      expect(vm.dialog?.kind).toBe('deleteTeam');
    });

    it('tells the dialogs about a running round, even one that begins while they are open', async () => {
      const { vm, fakes } = await setup({ viewer: 'admin' });
      vm.openRenameTeam(1);
      if (vm.dialog?.kind !== 'renameTeam') {
        throw new Error('Expected the rename dialog');
      }
      expect(vm.dialog.vm.roundNote).toBeUndefined();

      startRound(fakes);

      expect(vm.dialog.vm.roundNote).toBe(ROUND_RUNNING_NOTE);
    });

    it('drops the open dialog when the screen goes away', async () => {
      const { vm } = await setup({ viewer: 'admin' });
      vm.openRenameTeam(1);

      vm.dispose();

      expect(vm.dialog).toBeUndefined();
    });
  });
});
