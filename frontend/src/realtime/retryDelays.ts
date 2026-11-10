// Quick at first (a blip, a server restart), then a steady pace that never gives up: a phone in a pocket can be away
// far longer than SignalR's default four tries (about 40 seconds), and must come back on its own.
const EARLY_DELAYS_MS = [0, 1_000, 2_000, 5_000];
const STEADY_DELAY_MS = 10_000;

/** How long to wait before the next try, after `previousTries` failed ones. Never gives up. */
export function retryDelayMs(previousTries: number): number {
  return EARLY_DELAYS_MS[previousTries] ?? STEADY_DELAY_MS;
}
