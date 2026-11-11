import { compareNames } from './names';

/** How the admin's player list is ordered: grouped by team in the teams' own order, or highest score first. */
export type PlayerSortMode = 'team' | 'score';

export const playerSortModes: readonly PlayerSortMode[] = ['team', 'score'];

export function isPlayerSortMode(value: string): value is PlayerSortMode {
  return playerSortModes.some((mode) => mode === value);
}

/** What the sort needs from a player's score row. */
export interface SortablePlayerScore {
  playerId: number;
  displayName: string;
  teamId: number | null;
  total: number;
}

/**
 * A new list in the chosen order. The last key is always the player's id, so equal rows never change places between
 * two renders.
 *
 * - `team`: the teams in `teamOrder` (the server's display order), then display name, then id. A player with no team,
 *   or on a team `teamOrder` doesn't list (deleted, or the list isn't loaded yet), comes after every listed team.
 * - `score`: total descending, then display name, then id.
 */
export function sortPlayerScores<T extends SortablePlayerScore>(
  rows: readonly T[],
  mode: PlayerSortMode,
  teamOrder: readonly number[],
): T[] {
  const teamPlace = new Map(teamOrder.map((teamId, index) => [teamId, index]));
  const placeOf = (row: SortablePlayerScore): number =>
    row.teamId === null ? Number.POSITIVE_INFINITY : (teamPlace.get(row.teamId) ?? Number.POSITIVE_INFINITY);

  const byNameThenId = (a: T, b: T): number => compareNames(a.displayName, b.displayName) || a.playerId - b.playerId;

  return [...rows].sort((a, b) => {
    if (mode === 'score') {
      return b.total - a.total || byNameThenId(a, b);
    }
    const placeA = placeOf(a);
    const placeB = placeOf(b);
    // Infinity - Infinity is NaN, so equal places are told apart before subtracting.
    if (placeA !== placeB) {
      return placeA < placeB ? -1 : 1;
    }
    return byNameThenId(a, b);
  });
}
