// The score-entry form's rules, mirroring the server's so most mistakes never leave the phone. The server stays the
// authority. Messages written here end without a full stop, like a label (the server's own sentences keep theirs).

export const MULTIPLIER_MIN = 1;
export const MULTIPLIER_MAX = 100;
export const REASON_MAX_LENGTH = 200;

export type ScoreTargetKind = 'team' | 'player';
export type ScoreDirection = 'add' | 'remove';

/** Whole numbers only, written with digits. Anything else (empty, "1.5", "-3", "1e3", a unit) is `undefined`. */
export function parseWholeNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return undefined;
  }
  const value = Number(trimmed);
  // A very long run of digits is a whole number too, but not one the server (or a double) can hold exactly.
  return Number.isSafeInteger(value) ? value : undefined;
}

export function validateAmount(text: string): string | undefined {
  const value = parseWholeNumber(text);
  return value === undefined || value < 1 ? 'Enter a whole number above 0' : undefined;
}

export function validateMultiplier(text: string): string | undefined {
  const value = parseWholeNumber(text);
  return value === undefined || value < MULTIPLIER_MIN || value > MULTIPLIER_MAX
    ? `Enter a whole number from ${MULTIPLIER_MIN} to ${MULTIPLIER_MAX}`
    : undefined;
}

export function validateReason(text: string): string | undefined {
  return text.trim().length > REASON_MAX_LENGTH ? `Use at most ${REASON_MAX_LENGTH} characters` : undefined;
}

export function validateScoreTarget(chosen: boolean): string | undefined {
  return chosen ? undefined : 'Pick a team or a player';
}

/**
 * Points the entry would move: amount × multiplier, or `undefined` while either box doesn't hold a valid number.
 * This is what the buttons preview, so it is only ever shown for numbers the server would accept.
 */
export function entryTotal(amountText: string, multiplierText: string): number | undefined {
  if (validateAmount(amountText) !== undefined || validateMultiplier(multiplierText) !== undefined) {
    return undefined;
  }
  const amount = parseWholeNumber(amountText);
  const multiplier = parseWholeNumber(multiplierText);
  if (amount === undefined || multiplier === undefined) {
    return undefined;
  }
  const total = amount * multiplier;
  return Number.isSafeInteger(total) ? total : undefined;
}

const MINUS_SIGN = '\u2212';

/** "+30" or "−30" (a real minus sign, which lines up with the plus). Zero has no sign. */
export function formatSignedPoints(points: number): string {
  if (points > 0) {
    return `+${points}`;
  }
  return points < 0 ? `${MINUS_SIGN}${Math.abs(points)}` : '0';
}

/** The result the buttons show before anything is sent: "+30" to add, "−30" to remove. */
export function signedEntryTotal(total: number, direction: ScoreDirection): number {
  return direction === 'add' ? total : -total;
}

/** The sum behind the total, so a multiplier is never a surprise: "3 × 10 = 30 points for Team 1". */
export function describeEntry(options: {
  amount: number;
  multiplier: number;
  targetName: string | undefined;
}): string {
  const { amount, multiplier, targetName } = options;
  const total = amount * multiplier;
  const sum = multiplier === 1 ? '' : `${multiplier} \u00D7 ${amount} = `;
  const points = `${sum}${total} ${total === 1 ? 'point' : 'points'}`;
  return targetName === undefined ? points : `${points} for ${targetName}`;
}
