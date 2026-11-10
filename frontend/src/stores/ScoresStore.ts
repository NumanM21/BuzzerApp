import { makeAutoObservable, reaction } from 'mobx';
import type { ScoresApi } from '@/api/ScoresApi';
import type { Adjustment, AdjustmentRequest, PlayerScore, TeamScore } from '@/api/types';
import { Loadable } from '@/mvvm/Loadable';
import type { GameEvents } from '@/realtime/GameEvents';
import type { SessionStore } from './SessionStore';

/** How many recent adjustments the host screen lists. The server allows 1 to 100. */
const RECENT_ADJUSTMENTS_TAKE = 20;

/**
 * Scores, in the order the server sends them (never re-sorted here). Everyone sees `teamScores`; `playerScores`
 * and `recentAdjustments` are admin-only, so only an admin's screen asks for them.
 */
export class ScoresStore {
  readonly teamScores: Loadable<TeamScore[]>;
  readonly playerScores: Loadable<PlayerScore[]>;
  readonly recentAdjustments: Loadable<Adjustment[]>;

  private readonly api: ScoresApi;
  private readonly session: SessionStore;

  constructor(api: ScoresApi, session: SessionStore, events: GameEvents) {
    this.api = api;
    this.session = session;
    this.teamScores = new Loadable(() => api.getTeamScores());
    this.playerScores = new Loadable(() => api.getPlayerScores());
    this.recentAdjustments = new Loadable(() => api.getAdjustments(RECENT_ADJUSTMENTS_TAKE));

    // The stores live as long as the app, so these subscriptions are never undone.
    events.onScoresChanged(() => void this.reloadRequested());
    events.onReconnected(() => void this.reloadRequested());
    // Another person on this phone must never see the last person's data, not even while a reload runs.
    reaction(
      () => session.me?.playerId,
      () => this.reset(),
    );

    makeAutoObservable<ScoresStore, 'api' | 'session'>(
      this,
      { teamScores: false, playerScores: false, recentAdjustments: false, api: false, session: false },
      { autoBind: true },
    );
  }

  /** Loads the admin-only lists, unless the person isn't an admin (the server would answer 403). */
  async ensureAdminDataLoaded(): Promise<void> {
    if (!this.session.isAdmin) {
      return;
    }
    await Promise.all([this.playerScores.ensureLoaded(), this.recentAdjustments.ensureLoaded()]);
  }

  /** Reloads whatever a screen has asked for. Never rejects. */
  async reloadRequested(): Promise<void> {
    await Promise.all([
      this.teamScores.reloadIfRequested(),
      this.playerScores.reloadIfRequested(),
      this.recentAdjustments.reloadIfRequested(),
    ]);
  }

  /** Admin only. A write reloads at once; the hub's notification is for other people's phones. */
  async adjust(request: AdjustmentRequest): Promise<Adjustment> {
    const adjustment = await this.api.adjust(request);
    await this.reloadRequested();
    return adjustment;
  }

  /** Admin only. Answers with the undo row. */
  async reverse(adjustmentId: number): Promise<Adjustment> {
    const undo = await this.api.reverse(adjustmentId);
    await this.reloadRequested();
    return undo;
  }

  private reset(): void {
    this.teamScores.reset();
    this.playerScores.reset();
    this.recentAdjustments.reset();
  }
}
