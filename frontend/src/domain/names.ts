// The server's name rules (lengths after trimming). Layouts are checked against the maximums, and later steps
// validate input against them, so they live here once.
export const PERSON_NAME_MIN_LENGTH = 2;
export const PERSON_NAME_MAX_LENGTH = 20;
export const TEAM_NAME_MIN_LENGTH = 2;
export const TEAM_NAME_MAX_LENGTH = 24;

/**
 * The one way names are ordered on screen: case-insensitive, by character code, so it gives the same answer on every
 * phone and in every test. The browser's own `localeCompare` depends on the device's language and would not.
 */
export function compareNames(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
