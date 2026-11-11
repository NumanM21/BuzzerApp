/** What a leaderboard row needs from a team's score. */
export interface TeamScoreSource {
  teamId: number;
  name: string;
  colorKey: string;
  iconKey: string;
  total: number;
  rank: number;
}

/** One line of the team leaderboard, ready to draw. */
export interface TeamScoreRow extends TeamScoreSource {
  /** The viewer's own team (an admin has none). */
  isMine: boolean;
}

/**
 * The leaderboard rows in the order the server sent them. The rank is the server's: equal totals share one (1, 1, 3),
 * and counting places here would break that. `myTeamId` marks the viewer's team; `null` or `undefined` marks none.
 */
export function buildTeamScoreRows(
  scores: readonly TeamScoreSource[],
  myTeamId: number | null | undefined,
): TeamScoreRow[] {
  return scores.map((score) => ({ ...score, isMine: score.teamId === myTeamId }));
}
