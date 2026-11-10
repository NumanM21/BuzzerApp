/** "1 player", "3 players". The plural is given for words that don't just add an "s". */
export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The server answers a taken name with the same 409 title for both names and says which in the `detail`. There is no
 * other signal, so this reads the sentence ("A player with that real name is already registered. Sign in instead.").
 * It is the one place that does, and the join screen only offers "Sign in instead" on a match.
 */
export function isRealNameTakenMessage(detail: string): boolean {
  return /real name/i.test(detail);
}

/** The text for a 429. Without a `Retry-After` the server gave no time, so none is promised. */
export function describeRateLimit(seconds: number | undefined): string {
  return seconds === undefined
    ? 'Too many attempts. Try again in a moment'
    : `Too many attempts. Try again in ${formatCount(seconds, 'second')}`;
}
