import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { createScoresScenario } from '@/test/scoresScenario';
import { AdjustmentEntryViewModel, type TargetOption } from './AdjustmentEntryViewModel';

const MINUS = '−';

function targetOptions(teamCount = 2, playerCount = 2): TargetOption[] {
  const teams = Array.from({ length: teamCount }, (_, index) => ({
    key: `team:${index + 1}`,
    kind: 'team' as const,
    id: index + 1,
    name: `Team ${index + 1}`,
    label: `Team ${index + 1}`,
  }));
  const players = Array.from({ length: playerCount }, (_, index) => ({
    key: `player:${index + 1}`,
    kind: 'player' as const,
    id: index + 1,
    name: `Player ${index + 1}`,
    label: `Player ${index + 1} (Team 1)`,
  }));
  return [...teams, ...players];
}

async function setup(options: () => readonly TargetOption[] = () => targetOptions()) {
  const { fakes, services } = await createScoresScenario();
  const vm = new AdjustmentEntryViewModel(services.scores, options);
  return { vm, fakes, services };
}

interface FormValues {
  target?: string;
  amount?: string;
  multiplier?: string;
  reason?: string;
}

function fill(vm: AdjustmentEntryViewModel, values: FormValues) {
  if (values.target !== undefined) vm.selectTarget(values.target);
  if (values.amount !== undefined) vm.setAmount(values.amount);
  if (values.multiplier !== undefined) vm.setMultiplier(values.multiplier);
  if (values.reason !== undefined) vm.setReason(values.reason);
}

describe('AdjustmentEntryViewModel', () => {
  describe('before anything is typed', () => {
    it('starts with a multiplier of 1, nothing chosen and plain buttons', async () => {
      const { vm } = await setup();

      expect(vm.multiplier).toBe('1');
      expect(vm.amount).toBe('');
      expect(vm.selectedTargetKey).toBe('');
      expect(vm.addLabel).toBe('Add');
      expect(vm.removeLabel).toBe('Remove');
      expect(vm.previewLine).toBeUndefined();
    });

    it('splits the options into teams and players', async () => {
      const { vm } = await setup(() => targetOptions(3, 5));

      expect(vm.teamTargets).toHaveLength(3);
      expect(vm.playerTargets).toHaveLength(5);
    });
  });

  describe('the preview', () => {
    it('puts the result in the buttons: "Add +30" and "Remove −30"', async () => {
      const { vm } = await setup();

      fill(vm, { amount: '10', multiplier: '3' });

      expect(vm.total).toBe(30);
      expect(vm.addLabel).toBe('Add +30');
      expect(vm.removeLabel).toBe(`Remove ${MINUS}30`);
    });

    it('shows the sum behind a multiplier, with the target once one is chosen', async () => {
      const { vm } = await setup();

      fill(vm, { amount: '10', multiplier: '3' });
      expect(vm.previewLine).toBe('3 × 10 = 30 points');

      vm.selectTarget('team:2');
      expect(vm.previewLine).toBe('3 × 10 = 30 points for Team 2');
    });

    it.each([
      ['', '1'],
      ['0', '1'],
      ['abc', '1'],
      ['10', '0'],
      ['10', '101'],
      ['10', ''],
    ])('shows no result for amount "%s" × multiplier "%s"', async (amount, multiplier) => {
      const { vm } = await setup();

      fill(vm, { amount, multiplier });

      expect(vm.total).toBeUndefined();
      expect(vm.addLabel).toBe('Add');
      expect(vm.previewLine).toBeUndefined();
    });
  });

  describe('the note about which ledger the points go to', () => {
    it('says a team gets its own points, not its players', async () => {
      const { vm } = await setup();
      vm.selectTarget('team:1');
      expect(vm.targetNote).toMatch(/team only/);
    });

    it('says a player gets their own points, not their team', async () => {
      const { vm } = await setup();
      vm.selectTarget('player:1');
      expect(vm.targetNote).toMatch(/player only/);
    });

    it('has no note until a target is chosen', async () => {
      const { vm } = await setup();
      expect(vm.targetNote).toBeUndefined();
    });
  });

  describe('checking the form before sending', () => {
    it('refuses an empty form field by field and sends nothing', async () => {
      const { vm, fakes } = await setup();

      await vm.add();

      expect(vm.form.fieldErrors.targetId).toBe('Pick a team or a player');
      expect(vm.form.fieldErrors.amount).toBe('Enter a whole number above 0');
      expect(vm.form.fieldErrors.multiplier).toBeUndefined();
      expect(fakes.scoresApi.calls).not.toContain('adjust');
    });

    it.each([
      ['amount', { amount: '0' }, 'Enter a whole number above 0'],
      ['amount', { amount: '2.5' }, 'Enter a whole number above 0'],
      ['amount', { amount: '-4' }, 'Enter a whole number above 0'],
      ['multiplier', { multiplier: '0' }, 'Enter a whole number from 1 to 100'],
      ['multiplier', { multiplier: '101' }, 'Enter a whole number from 1 to 100'],
      ['reason', { reason: 'x'.repeat(201) }, 'Use at most 200 characters'],
    ] as const)('refuses a bad %s (%j)', async (field, values, message) => {
      const { vm, fakes } = await setup();
      fill(vm, { target: 'team:1', amount: '10', ...values });

      await vm.remove();

      expect(vm.form.fieldErrors[field]).toBe(message);
      expect(fakes.scoresApi.calls).not.toContain('adjust');
    });

    it('accepts the limits: multiplier 100 and a 200-character reason', async () => {
      const { vm, fakes } = await setup();
      fill(vm, { target: 'team:1', amount: '1', multiplier: '100', reason: 'r'.repeat(200) });

      await vm.add();

      expect(fakes.scoresApi.adjustments[0]).toMatchObject({ amount: 100 });
      expect(vm.form.fieldErrors).toEqual({});
    });

    it('takes away a field message when that field is edited', async () => {
      const { vm } = await setup();
      await vm.add();
      expect(vm.form.fieldErrors.amount).toBeDefined();

      vm.setAmount('5');

      expect(vm.form.fieldErrors.amount).toBeUndefined();
      expect(vm.form.fieldErrors.targetId).toBeDefined();
    });
  });

  describe('sending', () => {
    it('adds amount × multiplier to a team', async () => {
      const { vm, fakes } = await setup();
      fill(vm, { target: 'team:2', amount: '10', multiplier: '3' });

      await vm.add();

      expect(fakes.scoresApi.adjustments[0]).toMatchObject({ target: 'team', targetId: 2, amount: 30, reason: null });
    });

    it('removes points from a player, with a trimmed reason', async () => {
      const { vm, fakes } = await setup();
      fill(vm, { target: 'player:2', amount: '5', reason: '  Wrong answer  ' });

      await vm.remove();

      expect(fakes.scoresApi.adjustments[0]).toMatchObject({
        target: 'player',
        targetId: 2,
        amount: -5,
        reason: 'Wrong answer',
      });
    });

    it('leaves the reason out when it is only spaces', async () => {
      const { vm, fakes } = await setup();
      fill(vm, { target: 'team:1', amount: '5', reason: '   ' });

      await vm.add();

      expect(fakes.scoresApi.adjustments[0].reason).toBeNull();
    });

    it('says what it did, keeps the target and starts the numbers over', async () => {
      const { vm } = await setup();
      fill(vm, { target: 'team:1', amount: '10', multiplier: '3', reason: 'Round 2' });

      await vm.add();

      expect(vm.lastResult).toBe('+30 for Team 1');
      expect(vm.selectedTargetKey).toBe('team:1');
      expect(vm.amount).toBe('');
      expect(vm.multiplier).toBe('1');
      expect(vm.reason).toBe('');
    });

    it('reports a removal with a minus sign', async () => {
      const { vm } = await setup();
      fill(vm, { target: 'team:1', amount: '10' });

      await vm.remove();

      expect(vm.lastResult).toBe(`${MINUS}10 for Team 1`);
    });

    it('forgets the last result when the form is edited again', async () => {
      const { vm } = await setup();
      fill(vm, { target: 'team:1', amount: '10' });
      await vm.add();

      vm.setAmount('2');

      expect(vm.lastResult).toBeUndefined();
    });

    it('reloads the scores it changed', async () => {
      const { vm, fakes, services } = await setup();
      await services.scores.teamScores.load();
      await services.scores.recentAdjustments.load();
      fakes.scoresApi.clearCalls();
      fill(vm, { target: 'team:1', amount: '10' });

      await vm.add();

      expect(fakes.scoresApi.calls).toEqual(['adjust', 'getTeamScores', 'getAdjustments']);
    });

    it('sends one entry for a double tap', async () => {
      const { vm, fakes } = await setup();
      fill(vm, { target: 'team:1', amount: '10' });

      await Promise.all([vm.add(), vm.add(), vm.remove()]);

      expect(fakes.scoresApi.calls.filter((call) => call === 'adjust')).toHaveLength(1);
      expect(fakes.scoresApi.adjustments[0].amount).toBe(10);
    });
  });

  describe('when the server refuses', () => {
    it('puts each field message on its field and keeps what was typed', async () => {
      const { vm, fakes } = await setup();
      fakes.scoresApi.failNext(
        new ApiError({
          status: 400,
          kind: 'validation',
          fieldErrors: { amount: ['Amount is too large.'], reason: ['Reason is too long.'] },
        }),
      );
      fill(vm, { target: 'team:1', amount: '10', reason: 'Round 2' });

      await vm.add();

      expect(vm.form.fieldErrors.amount).toBe('Amount is too large.');
      expect(vm.form.fieldErrors.reason).toBe('Reason is too long.');
      expect(vm.amount).toBe('10');
      expect(vm.reason).toBe('Round 2');
      expect(vm.lastResult).toBeUndefined();
    });

    it('shows a message the form has no field for on the form', async () => {
      const { vm, fakes } = await setup();
      fakes.scoresApi.failNext(
        new ApiError({ status: 400, kind: 'validation', fieldErrors: { target: ['That target does not exist.'] } }),
      );
      fill(vm, { target: 'team:1', amount: '10' });

      await vm.add();

      expect(vm.form.formError).toBe('That target does not exist.');
    });

    it('shows the connection message when there is no network, and lets the person try again', async () => {
      const { vm, fakes } = await setup();
      fakes.scoresApi.failNext(new ApiError({ status: 0, kind: 'network' }));
      fill(vm, { target: 'team:1', amount: '10' });

      await vm.add();
      expect(vm.form.formError).toBe('Could not reach the server. Check your connection and try again.');

      await vm.add();
      expect(vm.form.formError).toBeUndefined();
      expect(vm.lastResult).toBe('+10 for Team 1');
    });
  });

  describe('when the target goes away', () => {
    it('chooses nothing once the chosen team is no longer offered', async () => {
      let options = targetOptions(3, 0);
      const { vm } = await setup(() => options);
      vm.selectTarget('team:3');
      expect(vm.target?.name).toBe('Team 3');

      options = targetOptions(2, 0);

      expect(vm.target).toBeUndefined();
      expect(vm.selectedTargetKey).toBe('');
      expect(vm.targetNote).toBeUndefined();
    });

    it('chooses nothing again when the picker is set back to its empty choice', async () => {
      const { vm } = await setup();
      vm.selectTarget('team:1');

      vm.selectTarget('');

      expect(vm.selectedTargetKey).toBe('');
    });
  });
});
