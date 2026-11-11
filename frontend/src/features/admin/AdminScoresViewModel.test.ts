import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { makePlayerScores, makeTeamScores, makeTeams } from '@/test/factories';
import { flushPromises } from '@/test/flushPromises';
import { createScoresScenario, type ScoresScenarioOptions } from '@/test/scoresScenario';
import { AdminScoresViewModel } from './AdminScoresViewModel';

async function setup(options: ScoresScenarioOptions = {}) {
  const scenario = await createScoresScenario(options);
  const { services } = scenario;
  const vm = new AdminScoresViewModel(services.scores, services.teams);
  return { vm, ...scenario };
}

async function setupActivated(options: ScoresScenarioOptions = {}) {
  const result = await setup(options);
  result.vm.activate();
  await flushPromises();
  return result;
}

describe('AdminScoresViewModel', () => {
  describe('loading', () => {
    it('loads the standings, the players, the recent changes and the teams, and shows loading until they arrive', async () => {
      const { vm, fakes } = await setup();
      expect(vm.teamState).toBe('loading');
      expect(vm.playerState).toBe('loading');

      vm.activate();
      await flushPromises();

      expect([...fakes.scoresApi.calls].sort()).toEqual(['getAdjustments', 'getPlayerScores', 'getTeamScores']);
      expect(fakes.teamsApi.calls).toEqual(['getTeams']);
      expect(vm.teamState).toBe('ready');
      expect(vm.playerState).toBe('ready');
      expect(vm.recent.state).toBe('ready');
    });

    it('never asks for admin-only lists for someone who is not an admin', async () => {
      const { vm, fakes } = await setup({ viewer: 'player' });

      vm.activate();
      await flushPromises();

      expect(fakes.scoresApi.calls).toEqual(['getTeamScores']);
    });

    it('shows the load error, keeps the lists it has, and reloads both lists', async () => {
      const { vm, fakes } = await setupActivated();
      fakes.scoresApi.failNext(new ApiError({ status: 500, kind: 'server', title: 'The server had a problem' }));

      vm.reload();
      await flushPromises();

      expect(vm.loadError).toBe('The server had a problem');
      expect(vm.teamRows).toHaveLength(3);

      fakes.scoresApi.clearCalls();
      vm.reload();
      await flushPromises();
      expect(fakes.scoresApi.calls).toEqual(['getTeamScores', 'getPlayerScores']);
      expect(vm.loadError).toBeUndefined();
    });

    it('follows a change the hub announces, on every list that is showing', async () => {
      const { vm, fakes } = await setupActivated();
      fakes.scoresApi.teamScores = makeTeamScores(3).map((score) => ({ ...score, total: 7 }));
      fakes.scoresApi.playerScores = makePlayerScores(6, 3).map((score) => ({ ...score, total: 9 }));

      fakes.events.emitScoresChanged();
      await flushPromises();

      expect(vm.teamRows.map((row) => row.total)).toEqual([7, 7, 7]);
      expect(vm.playerRows.every((row) => row.total === 9)).toBe(true);
    });
  });

  describe('team standings', () => {
    it.each([1, 2, 6, 13])('keep the server\'s order for %i teams, and mark no team as the viewer\'s', async (count) => {
      const { vm } = await setupActivated({ teamCount: count });

      expect(vm.teamRows.map((row) => row.teamId)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
      expect(vm.teamRows.some((row) => row.isMine)).toBe(false);
    });

    it('show shared ranks as sent', async () => {
      const { vm, fakes } = await setup({ teamCount: 3 });
      fakes.scoresApi.teamScores = makeTeamScores(3, 0);

      vm.activate();
      await flushPromises();

      expect(vm.teamRows.map((row) => row.rank)).toEqual([1, 1, 1]);
    });
  });

  describe('players, sorted by team or by score', () => {
    it('start in the teams\' display order, then by name', async () => {
      const { vm, fakes } = await setup({ teamCount: 3, playerCount: 6 });
      // Display order 3, 1, 2: not the order of the ids and not the standings.
      fakes.teamsApi.teams = [makeTeams(3)[2], makeTeams(3)[0], makeTeams(3)[1]];

      vm.activate();
      await flushPromises();

      // makePlayerScores deals players out to teams 1, 2, 3, 1, 2, 3.
      expect(vm.sortMode).toBe('team');
      expect(vm.playerRows.map((row) => row.displayName)).toEqual([
        'Player 3',
        'Player 6',
        'Player 1',
        'Player 4',
        'Player 2',
        'Player 5',
      ]);
    });

    it('can be sorted by score, highest first, ties by name', async () => {
      const { vm, fakes } = await setup({ teamCount: 2, playerCount: 4 });
      fakes.scoresApi.playerScores = makePlayerScores(4, 2).map((score, index) => ({
        ...score,
        total: [10, 30, 10, -5][index],
      }));
      vm.activate();
      await flushPromises();

      vm.setSortMode('score');

      expect(vm.playerRows.map((row) => [row.displayName, row.total])).toEqual([
        ['Player 2', 30],
        ['Player 1', 10],
        ['Player 3', 10],
        ['Player 4', -5],
      ]);
    });

    it('puts a player without a team last when sorted by team', async () => {
      const { vm, fakes } = await setup({ teamCount: 2, playerCount: 3 });
      fakes.scoresApi.playerScores = makePlayerScores(3, 2).map((score, index) =>
        index === 0 ? { ...score, teamId: null, teamName: null } : score,
      );
      vm.activate();
      await flushPromises();

      expect(vm.playerRows.map((row) => row.displayName)).toEqual(['Player 3', 'Player 2', 'Player 1']);
      expect(vm.playerRows[2].teamName).toBeNull();
    });

    it('ignores a sort mode it does not know', async () => {
      const { vm } = await setupActivated();

      vm.setSortMode('name');

      expect(vm.sortMode).toBe('team');
    });

    it('offers Team and Score', async () => {
      const { vm } = await setup();
      expect(vm.sortOptions.map((option) => option.label)).toEqual(['Team', 'Score']);
    });

    it('sorts a long list: 13 teams and 45 players, every player once', async () => {
      const { vm } = await setupActivated({ teamCount: 13, playerCount: 45 });

      expect(vm.playerRows).toHaveLength(45);
      expect(new Set(vm.playerRows.map((row) => row.id)).size).toBe(45);
      vm.setSortMode('score');
      expect(vm.playerRows).toHaveLength(45);
    });

    it('show a negative total as it is', async () => {
      const { vm, fakes } = await setup({ teamCount: 1, playerCount: 1 });
      fakes.scoresApi.playerScores = makePlayerScores(1).map((score) => ({ ...score, total: -40 }));

      vm.activate();
      await flushPromises();

      expect(vm.playerRows[0].total).toBe(-40);
    });
  });

  describe('the picker behind the entry form', () => {
    it('lists the teams in display order, then the players, each with their team', async () => {
      const { vm, fakes } = await setup({ teamCount: 2, playerCount: 3 });
      fakes.teamsApi.teams = [makeTeams(2)[1], makeTeams(2)[0]];
      vm.activate();
      await flushPromises();

      expect(vm.entry.teamTargets.map((option) => option.label)).toEqual(['Team 2', 'Team 1']);
      expect(vm.entry.playerTargets.map((option) => option.label)).toEqual([
        'Player 2 (Team 2)',
        'Player 1 (Team 1)',
        'Player 3 (Team 1)',
      ]);
    });

    it('says "no team" for a player who has none', async () => {
      const { vm, fakes } = await setup({ teamCount: 1, playerCount: 1 });
      fakes.scoresApi.playerScores = makePlayerScores(1).map((score) => ({ ...score, teamId: null, teamName: null }));
      vm.activate();
      await flushPromises();

      expect(vm.entry.playerTargets[0].label).toBe('Player 1 (no team)');
    });

    it('does not move when the list on screen is sorted differently', async () => {
      const { vm } = await setupActivated({ teamCount: 3, playerCount: 6 });
      const before = vm.entry.playerTargets.map((option) => option.key);

      vm.setSortMode('score');

      expect(vm.entry.playerTargets.map((option) => option.key)).toEqual(before);
    });

    it.each([1, 2, 6, 13])('offers each of %i teams once', async (count) => {
      const { vm } = await setupActivated({ teamCount: count, playerCount: 0 });

      expect(vm.entry.teamTargets.map((option) => option.id)).toEqual(
        Array.from({ length: count }, (_, index) => index + 1),
      );
    });

    it('offers the teams from the standings until the teams list has loaded', async () => {
      const { vm, services } = await setup({ teamCount: 3, playerCount: 0 });
      await services.scores.teamScores.load();

      expect(services.teams.teams.value).toBeUndefined();
      expect(vm.entry.teamTargets.map((option) => option.name)).toEqual(['Team 1', 'Team 2', 'Team 3']);
    });
  });

  describe('scoring through the screen', () => {
    it('adds points to a player and reloads the players, the standings and the recent changes', async () => {
      const { vm, fakes } = await setupActivated({ teamCount: 2, playerCount: 4 });
      fakes.scoresApi.clearCalls();
      vm.entry.selectTarget('player:3');
      vm.entry.setAmount('20');

      await vm.entry.add();

      expect(fakes.scoresApi.adjustments[0]).toMatchObject({ target: 'player', targetId: 3, amount: 20 });
      expect([...fakes.scoresApi.calls].sort()).toEqual(
        ['adjust', 'getAdjustments', 'getPlayerScores', 'getTeamScores'].sort(),
      );
      expect(vm.recent.rows[0]).toMatchObject({ amount: 20, targetKind: 'player' });
    });

    it('lets the newest change be undone straight away', async () => {
      const { vm } = await setupActivated();
      vm.entry.selectTarget('team:1');
      vm.entry.setAmount('15');
      await vm.entry.add();
      const added = vm.recent.rows[0];
      expect(added.undo).toBe('available');

      await vm.recent.undo(added.id);

      expect(vm.recent.rows[0]).toMatchObject({ isUndo: true, amount: -15 });
      expect(vm.recent.rows[1]).toMatchObject({ id: added.id, undo: 'alreadyUndone' });
    });
  });
});
