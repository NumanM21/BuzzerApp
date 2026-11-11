/**
 * A score as the pack wants it: zero-padded to `digits` (0 = no padding). A negative score is shown with its sign and
 * no padding (`-50`, not `-00050`): the padding gives the scoreboard its fixed-width look, and a minus sign in front
 * of a row of zeros reads as a different number. A score can drop below zero when points are removed.
 */
export function formatScore(score: number, digits: number): string {
  const magnitude = Math.abs(Math.trunc(score)).toString();
  return score < 0 ? `-${magnitude}` : magnitude.padStart(digits, '0');
}
