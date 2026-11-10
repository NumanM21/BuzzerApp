/**
 * A score as the pack wants it: zero-padded to `digits` (0 = no padding). The sign goes in front of the padding
 * (`-00012`), since a score can drop below zero when points are removed.
 */
export function formatScore(score: number, digits: number): string {
  const magnitude = Math.abs(Math.trunc(score)).toString().padStart(digits, '0');
  return score < 0 ? `-${magnitude}` : magnitude;
}
