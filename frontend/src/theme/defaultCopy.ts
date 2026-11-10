import type { BuzzerVisualState } from '@/domain/buzzer';

/**
 * The neutral wording for every piece of text a pack may flavour (an arcade pack might say "PRESS START" instead of
 * "Buzz!"). A pack's `copy` replaces keys one by one; anything it leaves out falls back to this.
 * Only text whose tone belongs to the theme goes here, not every label in the app.
 */
export const defaultCopy = {
  buzzerReady: 'Buzz!',
  buzzerYourTeamUp: "Your team's up!",
  buzzerQueued: 'In line',
  buzzerOut: 'Out this round',
  buzzerWaiting: 'Waiting for the host',
  teamNoMembers: 'No players yet',
  teamYou: 'You',
} as const satisfies Record<string, string>;

export type CopyKey = keyof typeof defaultCopy;

export type Copy = Record<CopyKey, string>;

/** Which copy key labels each buzzer state. */
export const buzzerCopyKeys: Record<BuzzerVisualState, CopyKey> = {
  ready: 'buzzerReady',
  yourTeamUp: 'buzzerYourTeamUp',
  queued: 'buzzerQueued',
  out: 'buzzerOut',
  waiting: 'buzzerWaiting',
};

export function mergeCopy(overrides: Partial<Copy> | undefined): Copy {
  const copy: Copy = { ...defaultCopy };
  for (const key of Object.keys(defaultCopy) as CopyKey[]) {
    // An empty string counts as "not given", so a half-filled pack never shows a blank label.
    const text = overrides?.[key];
    if (text) {
      copy[key] = text;
    }
  }
  return copy;
}
