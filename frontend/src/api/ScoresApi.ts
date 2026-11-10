import type { ApiClient } from './ApiClient';
import type { Adjustment, AdjustmentRequest, PlayerScore, TeamScore } from './types';

export interface ScoresApi {
  /** Total descending, then display order. Equal totals share a rank. */
  getTeamScores(): Promise<TeamScore[]>;
  /** Admin only. Total descending, then display name; players only. */
  getPlayerScores(): Promise<PlayerScore[]>;
  /** Admin only. Newest first; `take` is 1 to 100 (the server's default is 20). */
  getAdjustments(take?: number): Promise<Adjustment[]>;
  /** Admin only. */
  adjust(request: AdjustmentRequest): Promise<Adjustment>;
  /** Admin only. Answers with the undo row. */
  reverse(adjustmentId: number): Promise<Adjustment>;
}

export class HttpScoresApi implements ScoresApi {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  getTeamScores(): Promise<TeamScore[]> {
    return this.client.get<TeamScore[]>('/api/scores/teams');
  }

  getPlayerScores(): Promise<PlayerScore[]> {
    return this.client.get<PlayerScore[]>('/api/scores/players');
  }

  getAdjustments(take?: number): Promise<Adjustment[]> {
    return this.client.get<Adjustment[]>('/api/scores/adjustments', { query: { take } });
  }

  adjust(request: AdjustmentRequest): Promise<Adjustment> {
    return this.client.post<Adjustment>('/api/scores/adjustments', request);
  }

  reverse(adjustmentId: number): Promise<Adjustment> {
    return this.client.post<Adjustment>(`/api/scores/adjustments/${adjustmentId}/reverse`);
  }
}
