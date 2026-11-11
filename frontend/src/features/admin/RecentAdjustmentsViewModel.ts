import { makeAutoObservable, runInAction } from 'mobx';
import type { Adjustment } from '@/api/types';
import { formatClockTime } from '@/domain/clockTime';
import type { ScoreTargetKind } from '@/domain/scoreEntry';
import { Command } from '@/mvvm/Command';
import { listStateOf, type ListState } from '@/mvvm/listState';
import type { ScoresStore } from '@/stores/ScoresStore';

/**
 * What the row offers: an Undo button, nothing because the row is itself an undo (an undo can't be undone), or a
 * note that someone already undid it.
 */
export type UndoState = 'available' | 'notUndoable' | 'alreadyUndone';

export interface AdjustmentRowModel {
  id: number;
  targetKind: ScoreTargetKind;
  targetName: string;
  /** Signed: negative for a removal, or for the undo of an addition. */
  amount: number;
  reason: string | null;
  createdBy: string;
  /** The hour and minute, in the viewer's own time. */
  time: string;
  /** This row reverses an earlier one. */
  isUndo: boolean;
  undo: UndoState;
}

/** The newest adjustments, each with its Undo. The list is the server's, newest first. */
export class RecentAdjustmentsViewModel {
  /** The row whose Undo is on its way, so the view can show which button is busy. */
  undoingId: number | undefined = undefined;

  private readonly scores: ScoresStore;
  private readonly undoCommand: Command<[number]>;

  constructor(scores: ScoresStore) {
    this.scores = scores;
    this.undoCommand = new Command((id: number) => this.reverse(id));
    makeAutoObservable<RecentAdjustmentsViewModel, 'scores' | 'undoCommand'>(
      this,
      { scores: false, undoCommand: false },
      { autoBind: true },
    );
  }

  get state(): ListState {
    return listStateOf(this.scores.recentAdjustments);
  }

  /** Why the list could not be loaded; with a list on screen it is stale rather than missing. */
  get loadError(): string | undefined {
    return this.scores.recentAdjustments.error?.message;
  }

  get rows(): AdjustmentRowModel[] {
    return (this.scores.recentAdjustments.value ?? []).map(toRow);
  }

  /** The server's sentence for the last Undo that failed, until the next Undo. */
  get undoError(): string | undefined {
    return this.undoCommand.error?.message;
  }

  get isUndoing(): boolean {
    return this.undoCommand.isRunning;
  }

  reload(): void {
    void this.scores.recentAdjustments.load();
  }

  /** Does nothing for a row that offers no Undo, or while another Undo is running (no double tap, no two at once). */
  async undo(adjustmentId: number): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === adjustmentId);
    if (row?.undo !== 'available' || this.undoCommand.isRunning) {
      return;
    }
    this.undoingId = adjustmentId;
    await this.undoCommand.run(adjustmentId);
    runInAction(() => {
      this.undoingId = undefined;
    });
  }

  private async reverse(adjustmentId: number): Promise<void> {
    try {
      await this.scores.reverse(adjustmentId);
    } catch (reason) {
      // Typically a 409: another admin got there first. The store only reloads after a success, so bring the screen up
      // to date here, and let the command keep the server's sentence for the view.
      await this.scores.reloadRequested();
      throw reason;
    }
  }
}

function toRow(adjustment: Adjustment): AdjustmentRowModel {
  const isUndo = adjustment.reversesAdjustmentId !== null;
  return {
    id: adjustment.id,
    targetKind: adjustment.target,
    targetName: adjustment.targetName,
    amount: adjustment.amount,
    reason: adjustment.reason,
    createdBy: adjustment.createdByDisplayName,
    time: formatClockTime(adjustment.createdAt),
    isUndo,
    undo: isUndo ? 'notUndoable' : adjustment.isReversed ? 'alreadyUndone' : 'available',
  };
}
