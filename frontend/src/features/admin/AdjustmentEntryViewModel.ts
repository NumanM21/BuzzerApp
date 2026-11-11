import { makeAutoObservable, runInAction } from 'mobx';
import {
  describeEntry,
  entryTotal,
  formatSignedPoints,
  parseWholeNumber,
  validateAmount,
  validateMultiplier,
  validateReason,
  validateScoreTarget,
  type ScoreDirection,
  type ScoreTargetKind,
} from '@/domain/scoreEntry';
import { FormSubmission } from '@/mvvm/FormSubmission';
import type { ScoresStore } from '@/stores/ScoresStore';

/** One team or player the points can go to. `key` is what the picker holds (`team:3`, `player:7`). */
export interface TargetOption {
  key: string;
  kind: ScoreTargetKind;
  id: number;
  /** The name alone ("Team 1", "Player 7"): what the preview and the confirmation say. */
  name: string;
  /** What the picker shows; a player's also names their team, so two players are told apart at a glance. */
  label: string;
}

/** Field names are the request's own, so a server `400` lands on the box it concerns. */
export type EntryField = 'targetId' | 'amount' | 'multiplier' | 'reason';

const DEFAULT_MULTIPLIER = '1';

const TARGET_NOTES: Record<ScoreTargetKind, string> = {
  team: 'These points go to the team only, not to its players.',
  player: 'These points go to the player only, not to their team’s total.',
};

/**
 * The "add or remove points" form on the admin scoring screen: pick a team or a player, an amount, a multiplier and
 * optionally a reason, then Add or Remove. The buttons say what they will do ("Add +30") before anything is sent.
 *
 * Team and player scores are separate ledgers (D25), so the form says which one the points go to.
 */
export class AdjustmentEntryViewModel {
  amount = '';
  multiplier = DEFAULT_MULTIPLIER;
  reason = '';
  /** What the last accepted entry did, in words ("+30 for Team 1"), until the form is edited again. */
  lastResult: string | undefined = undefined;
  readonly form: FormSubmission<EntryField>;

  private chosenKey: string | undefined = undefined;
  private direction: ScoreDirection = 'add';
  private readonly scores: ScoresStore;
  private readonly options: () => readonly TargetOption[];

  /** `options` is read each time, because teams and players come and go while the form is open. */
  constructor(scores: ScoresStore, options: () => readonly TargetOption[]) {
    this.scores = scores;
    this.options = options;
    this.form = new FormSubmission<EntryField>({
      fields: ['targetId', 'amount', 'multiplier', 'reason'],
      validate: () => this.validate(),
      send: () => this.send(),
    });
    makeAutoObservable<AdjustmentEntryViewModel, 'scores' | 'options'>(
      this,
      { form: false, scores: false, options: false },
      { autoBind: true },
    );
  }

  // --- What the view shows -------------------------------------------------------------------------------------

  get teamTargets(): TargetOption[] {
    return this.options().filter((option) => option.kind === 'team');
  }

  get playerTargets(): TargetOption[] {
    return this.options().filter((option) => option.kind === 'player');
  }

  /** The chosen target, unless it has gone (a team deleted while the form was open): then nothing is chosen. */
  get target(): TargetOption | undefined {
    return this.options().find((option) => option.key === this.chosenKey);
  }

  get selectedTargetKey(): string {
    return this.target?.key ?? '';
  }

  get targetNote(): string | undefined {
    const target = this.target;
    return target === undefined ? undefined : TARGET_NOTES[target.kind];
  }

  /** Amount × multiplier while both boxes hold valid numbers. */
  get total(): number | undefined {
    return entryTotal(this.amount, this.multiplier);
  }

  get addLabel(): string {
    return this.total === undefined ? 'Add' : `Add ${formatSignedPoints(this.total)}`;
  }

  get removeLabel(): string {
    return this.total === undefined ? 'Remove' : `Remove ${formatSignedPoints(-this.total)}`;
  }

  /** The sum behind the buttons, "3 × 10 = 30 points for Team 1". Nothing until the numbers are valid. */
  get previewLine(): string | undefined {
    const amount = parseWholeNumber(this.amount);
    const multiplier = parseWholeNumber(this.multiplier);
    if (this.total === undefined || amount === undefined || multiplier === undefined) {
      return undefined;
    }
    return describeEntry({ amount, multiplier, targetName: this.target?.name });
  }

  // --- What the view does --------------------------------------------------------------------------------------

  selectTarget(key: string): void {
    this.chosenKey = key === '' ? undefined : key;
    this.edited('targetId');
  }

  setAmount(value: string): void {
    this.amount = value;
    this.edited('amount');
  }

  setMultiplier(value: string): void {
    this.multiplier = value;
    this.edited('multiplier');
  }

  setReason(value: string): void {
    this.reason = value;
    this.edited('reason');
  }

  async add(): Promise<void> {
    await this.submit('add');
  }

  async remove(): Promise<void> {
    await this.submit('remove');
  }

  // --- Internals -------------------------------------------------------------------------------------------------

  private async submit(direction: ScoreDirection): Promise<void> {
    // A second tap while one entry is on its way is ignored, so it can't change the first entry's direction either.
    if (this.form.isSubmitting) {
      return;
    }
    this.direction = direction;
    this.lastResult = undefined;
    if (await this.form.submit()) {
      // The target stays: scoring several rounds for the same team is the common case. The numbers start over.
      runInAction(() => {
        this.amount = '';
        this.multiplier = DEFAULT_MULTIPLIER;
        this.reason = '';
      });
    }
  }

  private validate(): Partial<Record<EntryField, string>> {
    const checks: [EntryField, string | undefined][] = [
      ['targetId', validateScoreTarget(this.target !== undefined)],
      ['amount', validateAmount(this.amount)],
      ['multiplier', validateMultiplier(this.multiplier)],
      ['reason', validateReason(this.reason)],
    ];
    const errors: Partial<Record<EntryField, string>> = {};
    for (const [field, message] of checks) {
      if (message !== undefined) {
        errors[field] = message;
      }
    }
    return errors;
  }

  private async send(): Promise<void> {
    const target = this.target;
    const amount = parseWholeNumber(this.amount);
    const multiplier = parseWholeNumber(this.multiplier);
    if (target === undefined || amount === undefined || multiplier === undefined) {
      return; // validate() has already refused this
    }
    const reason = this.reason.trim();
    const adjustment = await this.scores.adjust({
      target: target.kind,
      targetId: target.id,
      amount,
      multiplier,
      direction: this.direction,
      ...(reason !== '' && { reason }),
    });
    runInAction(() => {
      this.lastResult = `${formatSignedPoints(adjustment.amount)} for ${adjustment.targetName}`;
    });
  }

  private edited(field: EntryField): void {
    this.form.fieldEdited(field);
    this.lastResult = undefined;
  }
}
