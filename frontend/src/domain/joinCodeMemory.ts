/**
 * Remembers the last join code used on this phone, so a returning player doesn't retype it. An interface because
 * view models must not touch `localStorage`: the browser version is in `app/`, tests pass a fake.
 */
export interface JoinCodeMemory {
  /** The remembered code, or `undefined` when none (or when the browser can't store anything). */
  recall(): string | undefined;
  remember(code: string): void;
}
