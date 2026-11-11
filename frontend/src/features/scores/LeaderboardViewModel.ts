import { makeAutoObservable } from 'mobx';
import { buildTeamScoreRows, type TeamScoreRow } from '@/domain/scoreRows';
import { listStateOf, type ListState } from '@/mvvm/listState';
import type { ScoresStore } from '@/stores/ScoresStore';
import type { SessionStore } from '@/stores/SessionStore';

/**
 * `/scores`: the team leaderboard, for everyone (an admin sees the same page). The rows are in the server's order and
 * carry the server's ranks; the screen never sorts or ranks.
 */
export class LeaderboardViewModel {
  private readonly scores: ScoresStore;
  private readonly session: SessionStore;

  constructor(scores: ScoresStore, session: SessionStore) {
    this.scores = scores;
    this.session = session;
    makeAutoObservable<LeaderboardViewModel, 'scores' | 'session'>(
      this,
      { scores: false, session: false },
      { autoBind: true },
    );
  }

  activate(): void {
    void this.scores.teamScores.ensureLoaded();
  }

  get state(): ListState {
    return listStateOf(this.scores.teamScores);
  }

  /** Why the last load failed. With a list on screen it is stale rather than missing: show both. */
  get loadError(): string | undefined {
    return this.scores.teamScores.error?.message;
  }

  get rows(): TeamScoreRow[] {
    return buildTeamScoreRows(this.scores.teamScores.value ?? [], this.session.me?.teamId);
  }

  reload(): void {
    void this.scores.teamScores.load();
  }
}
