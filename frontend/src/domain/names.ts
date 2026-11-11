// The server's name rules (lengths after trimming). Layouts are checked against the maximums, and later steps
// validate input against them, so they live here once.
export const PERSON_NAME_MIN_LENGTH = 2;
export const PERSON_NAME_MAX_LENGTH = 20;
export const TEAM_NAME_MIN_LENGTH = 2;
export const TEAM_NAME_MAX_LENGTH = 24;

/**
 * The one way names are ordered on screen: case-insensitive, by character code, so it gives the same answer on every
 * phone and in every test. The browser's own `localeCompare` depends on the device's language and would not.
 *
 * Upper-cased, not lower-cased, because that is how the server orders its lists (.NET's `OrdinalIgnoreCase`), and a
 * list sorted here must agree with one the server sorted. The two differ for names with "_", "[", "^" and the other
 * characters that sit between "Z" and "a".
 */
export function compareNames(a: string, b: string): number {
  const left = a.toUpperCase();
  const right = b.toUpperCase();
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
