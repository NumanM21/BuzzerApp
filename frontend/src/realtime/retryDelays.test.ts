import { describe, expect, it, vi } from 'vitest';
import { reconnectPolicy, retryDelayMs } from './retryDelays';

describe('retryDelayMs', () => {
  it('tries quickly at first, then every ten seconds', () => {
    const delays = Array.from({ length: 7 }, (_, previousTries) => retryDelayMs(previousTries));

    expect(delays).toEqual([0, 1_000, 2_000, 5_000, 10_000, 10_000, 10_000]);
  });

  it('never gives up, however long the phone was away', () => {
    expect(retryDelayMs(10_000)).toBe(10_000);
  });
});

describe('reconnectPolicy', () => {
  it('waits as retryDelayMs says and never gives up (SignalR stops at the first null)', () => {
    const policy = reconnectPolicy(() => {});

    for (const previousRetryCount of [0, 1, 2, 3, 4, 50, 5000]) {
      expect(policy.nextRetryDelayInMilliseconds({ previousRetryCount })).toBe(retryDelayMs(previousRetryCount));
    }
  });

  it('reports every try that failed, but not the drop itself (SignalR asks once before its first try)', () => {
    const failed = vi.fn();
    const policy = reconnectPolicy(failed);

    policy.nextRetryDelayInMilliseconds({ previousRetryCount: 0 });
    expect(failed).not.toHaveBeenCalled();

    policy.nextRetryDelayInMilliseconds({ previousRetryCount: 1 });
    policy.nextRetryDelayInMilliseconds({ previousRetryCount: 2 });
    expect(failed).toHaveBeenCalledTimes(2);
  });
});
