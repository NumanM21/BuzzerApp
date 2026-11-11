// Quick at first (a blip, a server restart), then a steady pace that never gives up: a phone in a pocket can be away
// far longer than SignalR's default four tries (about 40 seconds), and must come back on its own.
const EARLY_DELAYS_MS = [0, 1_000, 2_000, 5_000];
const STEADY_DELAY_MS = 10_000;

/** How long to wait before the next try, after `previousTries` failed ones. Never gives up. */
export function retryDelayMs(previousTries: number): number {
  return EARLY_DELAYS_MS[previousTries] ?? STEADY_DELAY_MS;
}

/** The policy SignalR asks how long to wait before its next try to get a dropped connection back. */
export interface ReconnectPolicy {
  nextRetryDelayInMilliseconds(context: { previousRetryCount: number }): number;
}

/**
 * SignalR's own reconnect, with delays that never run out (its default policy stops after four tries).
 *
 * SignalR tells nobody when one of its tries fails; this policy is the only place that hears of it. It is asked once
 * when the connection drops (no try made yet) and again after every try that failed, so every call after the first
 * is a failed try and is passed on to `onAttemptFailed`.
 */
export function reconnectPolicy(onAttemptFailed: () => void): ReconnectPolicy {
  return {
    nextRetryDelayInMilliseconds({ previousRetryCount }) {
      if (previousRetryCount > 0) {
        onAttemptFailed();
      }
      return retryDelayMs(previousRetryCount);
    },
  };
}
