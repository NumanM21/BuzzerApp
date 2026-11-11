import { useState } from 'react';

/**
 * The value, or the last one it had while it is `undefined` now.
 *
 * For a dialog that is closing. A view model says "no dialog" the moment one is dismissed, but the dialog must stay
 * on the page a little longer, told it is closed, so that it can hand the screen back to screen readers and the
 * keyboard back to the button that opened it. Removing it outright while open skips both. This keeps what was
 * showing so there is something to close.
 */
export function useLastDefined<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  // How React keeps a value from an earlier render: set state during render, and only when it differs.
  if (value !== undefined && value !== last) {
    setLast(value);
  }
  return value ?? last;
}
