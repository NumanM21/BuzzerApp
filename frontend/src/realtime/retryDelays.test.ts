import { describe, expect, it } from 'vitest';
import { retryDelayMs } from './retryDelays';

describe('retryDelayMs', () => {
  it('tries quickly at first, then every ten seconds', () => {
    const delays = Array.from({ length: 7 }, (_, previousTries) => retryDelayMs(previousTries));

    expect(delays).toEqual([0, 1_000, 2_000, 5_000, 10_000, 10_000, 10_000]);
  });

  it('never gives up, however long the phone was away', () => {
    expect(retryDelayMs(10_000)).toBe(10_000);
  });
});
