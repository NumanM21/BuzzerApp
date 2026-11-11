import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { Adjustment } from '@/api/types';
import { deferred } from '@/test/deferred';
import { makeAdjustments } from '@/test/factories';
import { flushPromises } from '@/test/flushPromises';
import { createScoresScenario } from '@/test/scoresScenario';
import { RecentAdjustmentsViewModel } from './RecentAdjustmentsViewModel';

async function setup(adjustments?: Adjustment[]) {
  const { fakes, services } = await createScoresScenario();
  if (adjustments !== undefined) {
    fakes.scoresApi.adjustments = adjustments;
  }
  const vm = new RecentAdjustmentsViewModel(services.scores);
  // Both lists are on screen, so a change must refresh both.
  await Promise.all([services.scores.recentAdjustments.load(), services.scores.teamScores.load()]);
  fakes.scoresApi.clearCalls();
  return { vm, fakes, services };
}

/** A newest-first list: an addition that was undone, the undo of it, and a plain addition. */
function undoneAndUndo(): Adjustment[] {
  const [plain, , original] = makeAdjustments(3);
  return [
    { ...plain, id: 3, amount: -30, reversesAdjustmentId: 2, isReversed: false },
    { ...original, id: 2, amount: 30, reversesAdjustmentId: null, isReversed: true },
    { ...plain, id: 1, amount: 10, reversesAdjustmentId: null, isReversed: false },
  ];
}

describe('RecentAdjustmentsViewModel', () => {
  describe('the rows', () => {
    it('are the server\'s list, newest first, with who changed what', async () => {
      const { vm } = await setup(makeAdjustments(3));

      expect(vm.state).toBe('ready');
      expect(vm.rows.map((row) => row.id)).toEqual([3, 2, 1]);
      expect(vm.rows[0]).toMatchObject({ targetKind: 'team', targetName: 'Team 1', amount: 30, createdBy: 'Host' });
      expect(vm.rows[0].time).not.toBe('');
    });

    it('carry a player target and the reason', async () => {
      const [first] = makeAdjustments(1);
      const { vm } = await setup([{ ...first, target: 'player', targetName: 'Player 4', reason: 'Bonus round' }]);

      expect(vm.rows[0]).toMatchObject({ targetKind: 'player', targetName: 'Player 4', reason: 'Bonus round' });
    });

    it.each([0, 1, 20])('copes with %i rows', async (count) => {
      const { vm } = await setup(makeAdjustments(count));

      expect(vm.rows).toHaveLength(count);
      expect(vm.state).toBe(count === 0 ? 'empty' : 'ready');
    });
  });

  describe('which rows offer Undo', () => {
    it('offers it on a plain change, not on an undo, and says so on a change already undone', async () => {
      const { vm } = await setup(undoneAndUndo());

      const [undo, undone, plain] = vm.rows;

      expect(undo).toMatchObject({ isUndo: true, undo: 'notUndoable' });
      expect(undone).toMatchObject({ isUndo: false, undo: 'alreadyUndone' });
      expect(plain).toMatchObject({ isUndo: false, undo: 'available' });
    });
  });

  describe('undo', () => {
    it('reverses the row and shows the undo and the undone row at once', async () => {
      const { vm, fakes } = await setup(makeAdjustments(2));

      await vm.undo(2);

      expect(fakes.scoresApi.calls).toEqual(['reverse', 'getTeamScores', 'getAdjustments']);
      const [undo, undone] = vm.rows;
      expect(undo).toMatchObject({ isUndo: true, amount: -20, undo: 'notUndoable' });
      expect(undone).toMatchObject({ id: 2, undo: 'alreadyUndone' });
      expect(vm.undoError).toBeUndefined();
      expect(vm.undoingId).toBeUndefined();
    });

    it('does nothing for an undo row, a row already undone, or a row that is not there', async () => {
      const { vm, fakes } = await setup(undoneAndUndo());

      await vm.undo(3);
      await vm.undo(2);
      await vm.undo(99);

      expect(fakes.scoresApi.calls).toEqual([]);
    });

    it('sends one reverse for a double tap', async () => {
      const { vm, fakes } = await setup(makeAdjustments(2));

      await Promise.all([vm.undo(2), vm.undo(2)]);

      expect(fakes.scoresApi.calls.filter((call) => call === 'reverse')).toHaveLength(1);
    });

    it('allows only one undo at a time, and knows which row it is busy with', async () => {
      const { vm, fakes } = await setup(makeAdjustments(3));
      const gate = deferred<void>();
      const reverse = fakes.scoresApi.reverse.bind(fakes.scoresApi);
      fakes.scoresApi.reverse = async (id) => {
        await gate.promise;
        return reverse(id);
      };

      const first = vm.undo(3);
      await flushPromises();
      expect(vm.isUndoing).toBe(true);
      expect(vm.undoingId).toBe(3);

      await vm.undo(2); // ignored while the first is on its way
      gate.resolve();
      await first;

      expect(fakes.scoresApi.calls.filter((call) => call === 'reverse')).toHaveLength(1);
      expect(vm.isUndoing).toBe(false);
      expect(vm.undoingId).toBeUndefined();
    });

    it('shows the server\'s sentence and reloads when someone else undid the row first', async () => {
      const { vm, fakes } = await setup(makeAdjustments(2));
      fakes.scoresApi.failNext(
        new ApiError({ status: 409, kind: 'conflict', detail: 'That adjustment has already been undone.' }),
      );

      await vm.undo(2);

      expect(vm.undoError).toBe('That adjustment has already been undone.');
      expect(fakes.scoresApi.calls).toEqual(['reverse', 'getTeamScores', 'getAdjustments']);
      expect(vm.undoingId).toBeUndefined();
    });

    it('shows the connection message when there is no network', async () => {
      const { vm, fakes } = await setup(makeAdjustments(1));
      fakes.scoresApi.failNext(new ApiError({ status: 0, kind: 'network' }));

      await vm.undo(1);

      expect(vm.undoError).toBe('Could not reach the server. Check your connection and try again.');
    });

    it('forgets the last error when the next undo starts', async () => {
      const { vm, fakes } = await setup(makeAdjustments(2));
      fakes.scoresApi.failNext(new ApiError({ status: 409, kind: 'conflict', detail: 'Already undone.' }));
      await vm.undo(2);
      expect(vm.undoError).toBeDefined();

      await vm.undo(2);

      expect(vm.undoError).toBeUndefined();
    });
  });

  describe('loading', () => {
    it('shows the error when the list could not be loaded, and the list again after a reload', async () => {
      const { fakes, services } = await createScoresScenario();
      const vm = new RecentAdjustmentsViewModel(services.scores);
      fakes.scoresApi.failNext(new ApiError({ status: 500, kind: 'server', title: 'The server had a problem' }));

      await services.scores.recentAdjustments.load();
      expect(vm.state).toBe('error');
      expect(vm.loadError).toBe('The server had a problem');

      vm.reload();
      await flushPromises();
      expect(vm.state).toBe('ready');
      expect(vm.loadError).toBeUndefined();
    });
  });
});
