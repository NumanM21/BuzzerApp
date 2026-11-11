/** The teams a player can be moved to: every team except the one they are on (D21). Order is kept as given. */
export function otherTeams<T extends { id: number }>(teams: readonly T[], currentTeamId: number | null): T[] {
  return teams.filter((team) => team.id !== currentTeamId);
}

/**
 * The pack's colour keys that no team uses yet, in the pack's order. The server refuses a second team with the same
 * colour, so offering only free ones means the common mistake never reaches it.
 */
export function freeColorKeys(packColorKeys: readonly string[], teams: readonly { colorKey: string }[]): string[] {
  const used = new Set(teams.map((team) => team.colorKey));
  return packColorKeys.filter((key) => !used.has(key));
}
