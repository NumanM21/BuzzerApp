import { ApiError } from '@/api/ApiError';
import type { ScoresApi } from '@/api/ScoresApi';
import type { Adjustment, AdjustmentRequest, PlayerScore, TeamScore } from '@/api/types';
import { makeAdjustments, makePlayerScores, makeTeamScores } from '@/test/factories';
import { CallRecorder } from './CallRecorder';

/**
 * In-memory `ScoresApi`. It does not recompute totals: a test that needs them to change sets them by hand.
 * `failNext(error)` makes the next call reject; `calls` records what was called.
 */
export class FakeScoresApi implements ScoresApi {
  teamScores: TeamScore[] = makeTeamScores(3);
  playerScores: PlayerScore[] = makePlayerScores(6, 3);
  /** Newest first, like the server's list. */
  adjustments: Adjustment[] = makeAdjustments(3);

  private readonly recorder = new CallRecorder();

  get calls(): readonly string[] {
    return this.recorder.calls;
  }

  failNext(error: Error): void {
    this.recorder.failNext(error);
  }

  /** Forgets the calls so far, to assert only on what a later step did. */
  clearCalls(): void {
    this.recorder.clearCalls();
  }

  getTeamScores(): Promise<TeamScore[]> {
    return this.recorder.run('getTeamScores', () => this.teamScores);
  }

  getPlayerScores(): Promise<PlayerScore[]> {
    return this.recorder.run('getPlayerScores', () => this.playerScores);
  }

  getAdjustments(take = 20): Promise<Adjustment[]> {
    return this.recorder.run('getAdjustments', () => this.adjustments.slice(0, take));
  }

  adjust(request: AdjustmentRequest): Promise<Adjustment> {
    return this.recorder.run('adjust', () => {
      const sign = request.direction === 'add' ? 1 : -1;
      const adjustment: Adjustment = {
        id: this.nextId(),
        target: request.target,
        targetId: request.targetId,
        targetName: `${request.target === 'team' ? 'Team' : 'Player'} ${request.targetId}`,
        amount: sign * request.amount * request.multiplier,
        reason: request.reason ?? null,
        reversesAdjustmentId: null,
        isReversed: false,
        createdAt: '2030-01-01T21:00:00.000Z',
        createdByDisplayName: 'Host',
      };
      this.adjustments = [adjustment, ...this.adjustments];
      return adjustment;
    });
  }

  reverse(adjustmentId: number): Promise<Adjustment> {
    return this.recorder.run('reverse', () => {
      const original = this.adjustments.find((candidate) => candidate.id === adjustmentId);
      if (!original) {
        throw new ApiError({ status: 404, kind: 'notFound' });
      }
      const undo: Adjustment = {
        ...original,
        id: this.nextId(),
        amount: -original.amount,
        reversesAdjustmentId: original.id,
        isReversed: false,
      };
      const marked = this.adjustments.map((row) => (row.id === original.id ? { ...row, isReversed: true } : row));
      this.adjustments = [undo, ...marked];
      return undo;
    });
  }

  private nextId(): number {
    return Math.max(0, ...this.adjustments.map((row) => row.id)) + 1;
  }
}
