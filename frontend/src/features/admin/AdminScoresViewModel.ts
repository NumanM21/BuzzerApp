import { makeAutoObservable } from 'mobx';
import { isPlayerSortMode, sortPlayerScores, type PlayerSortMode } from '@/domain/playerScoreSort';
import { buildTeamScoreRows, type TeamScoreRow } from '@/domain/scoreRows';
import { listStateOf, type ListState } from '@/mvvm/listState';
import type { ScoresStore } from '@/stores/ScoresStore';
import type { TeamsStore } from '@/stores/TeamsStore';
import { AdjustmentEntryViewModel, type TargetOption } from './AdjustmentEntryViewModel';
import { RecentAdjustmentsViewModel } from './RecentAdjustmentsViewModel';

/** One line of the individual scores. A player's points are their own: they never count towards the team's total. */
export interface PlayerScoreRow {
  id: number;
  displayName: string;
  realName: string;
  /** `null` for a player with no team. */
  teamName: string | null;
  total: number;
}

export const playerSortOptions: readonly { value: PlayerSortMode; label: string }[] = [
  { value: 'team', label: 'Team' },
  { value: 'score', label: 'Score' },
];

/**
 * `/admin/scores`: the standings, the form that changes them, the newest changes with their Undo, and every player's
 * own score. The form and the Undo list have view models of their own; this one owns the lists and the sort.
 *
 * Another admin may be scoring at the same time, so nothing here assumes the screen is current: every write reloads
 * (the store does that) and the hub's "scores changed" covers the other admin's changes.
 */
export class AdminScoresViewModel {
  sortMode: PlayerSortMode = 'team';
  readonly entry: AdjustmentEntryViewModel;
  readonly recent: RecentAdjustmentsViewModel;

  private readonly scores: ScoresStore;
  private readonly teams: TeamsStore;

  constructor(scores: ScoresStore, teams: TeamsStore) {
    this.scores = scores;
    this.teams = teams;
    this.entry = new AdjustmentEntryViewModel(scores, () => this.targetOptions);
    this.recent = new RecentAdjustmentsViewModel(scores);
    makeAutoObservable<AdminScoresViewModel, 'scores' | 'teams'>(
      this,
      { entry: false, recent: false, scores: false, teams: false },
      { autoBind: true },
    );
  }

  activate(): void {
    void this.scores.teamScores.ensureLoaded();
    void this.scores.ensureAdminDataLoaded();
    // The teams' display order is what "sort by team" and the picker follow.
    void this.teams.teams.ensureLoaded();
  }

  // --- Team standings --------------------------------------------------------------------------------------------

  get teamState(): ListState {
    return listStateOf(this.scores.teamScores);
  }

  get teamRows(): TeamScoreRow[] {
    // An admin is on no team, so no row is theirs.
    return buildTeamScoreRows(this.scores.teamScores.value ?? [], null);
  }

  // --- Individual scores -----------------------------------------------------------------------------------------

  get playerState(): ListState {
    return listStateOf(this.scores.playerScores);
  }

  get sortOptions(): typeof playerSortOptions {
    return playerSortOptions;
  }

  get playerRows(): PlayerScoreRow[] {
    return sortPlayerScores(this.scores.playerScores.value ?? [], this.sortMode, this.teamOrder).map((score) => ({
      id: score.playerId,
      displayName: score.displayName,
      realName: score.realName,
      teamName: score.teamName,
      total: score.total,
    }));
  }

  /** Takes the radio group's string; a value that is not a mode is ignored. */
  setSortMode(value: string): void {
    if (isPlayerSortMode(value)) {
      this.sortMode = value;
    }
  }

  /** Why the standings or the player list could not be loaded; with a list on screen it is stale, not missing. */
  get loadError(): string | undefined {
    return this.scores.teamScores.error?.message ?? this.scores.playerScores.error?.message;
  }

  reload(): void {
    void this.scores.teamScores.load();
    void this.scores.playerScores.load();
  }

  // --- Who the points can go to ----------------------------------------------------------------------------------

  /** The teams in display order (the teams list's), or in standings order until that list has loaded. */
  private get teamChoices(): { id: number; name: string }[] {
    const teams = this.teams.teams.value;
    if (teams !== undefined) {
      return teams.map((team) => ({ id: team.id, name: team.name }));
    }
    return (this.scores.teamScores.value ?? []).map((score) => ({ id: score.teamId, name: score.name }));
  }

  private get teamOrder(): number[] {
    return this.teamChoices.map((team) => team.id);
  }

  /** Teams first, then players in the "by team" order, whatever the list on screen is sorted by: the picker stays put. */
  private get targetOptions(): TargetOption[] {
    const teamOptions = this.teamChoices.map<TargetOption>((team) => ({
      key: `team:${team.id}`,
      kind: 'team',
      id: team.id,
      name: team.name,
      label: team.name,
    }));
    const players = sortPlayerScores(this.scores.playerScores.value ?? [], 'team', this.teamOrder);
    const playerOptions = players.map<TargetOption>((player) => ({
      key: `player:${player.playerId}`,
      kind: 'player',
      id: player.playerId,
      name: player.displayName,
      label: `${player.displayName} (${player.teamName ?? 'no team'})`,
    }));
    return [...teamOptions, ...playerOptions];
  }
}
