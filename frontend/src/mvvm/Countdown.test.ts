import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Countdown } from './Countdown';

describe('Countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is idle until started', () => {
    const countdown = new Countdown();
    expect(countdown.secondsLeft).toBe(0);
    expect(countdown.isActive).toBe(false);
  });

  it('counts down in whole seconds and stops at zero', () => {
    const countdown = new Countdown();
    countdown.start(3);
    expect(countdown.secondsLeft).toBe(3);

    vi.advanceTimersByTime(1000);
    expect(countdown.secondsLeft).toBe(2);

    vi.advanceTimersByTime(2000);
    expect(countdown.secondsLeft).toBe(0);
    expect(countdown.isActive).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the time left by the clock, so a throttled timer that fires late still catches up', () => {
    let clock = 0;
    const countdown = new Countdown(() => clock);
    countdown.start(10);

    clock = 7_200;
    vi.advanceTimersByTime(500);

    expect(countdown.secondsLeft).toBe(3);
  });

  it('restarts from the new time when started again, without a second timer', () => {
    const countdown = new Countdown();
    countdown.start(5);
    vi.advanceTimersByTime(2000);

    countdown.start(10);

    expect(countdown.secondsLeft).toBe(10);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each([0, -4])('does not start for %i seconds', (seconds) => {
    const countdown = new Countdown();
    countdown.start(seconds);
    expect(countdown.isActive).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops everything on dispose, which may be called twice', () => {
    const countdown = new Countdown();
    countdown.start(30);

    countdown.dispose();
    countdown.dispose();

    expect(countdown.secondsLeft).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
