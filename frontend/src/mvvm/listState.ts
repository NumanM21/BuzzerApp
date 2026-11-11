import type { Loadable } from './Loadable';

/** What a screen showing a list draws: a spinner, an error, "nothing yet", or the list. */
export type ListState = 'loading' | 'error' | 'empty' | 'ready';

/**
 * The state of a list screen from the `Loadable` behind it. A list already on screen stays `ready` while a reload
 * runs or fails (the screen shows the stale list, plus the error if there is one), so only a screen with nothing to
 * show is `loading` or `error`.
 */
export function listStateOf(list: Loadable<readonly unknown[]>): ListState {
  if (list.value === undefined) {
    return list.status === 'error' ? 'error' : 'loading';
  }
  return list.value.length === 0 ? 'empty' : 'ready';
}
