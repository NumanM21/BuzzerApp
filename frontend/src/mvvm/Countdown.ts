import { makeAutoObservable } from 'mobx';

const TICK_MS = 500;

/**
 * Whole seconds left until a deadline, for "try again in N seconds" after a 429. It ticks twice a second but derives
 * the number from the deadline, so a phone that throttles background timers still shows the right figure when it
 * wakes. Call `dispose()` when the owner goes away.
 */
export class Countdown {
  secondsLeft = 0;

  private endsAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined = undefined;
  private readonly now: () => number;

  /** `now` is the clock in milliseconds; a test passes its own. */
  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    makeAutoObservable<Countdown, 'endsAt' | 'timer' | 'now'>(
      this,
      { endsAt: false, timer: false, now: false },
      { autoBind: true },
    );
  }

  get isActive(): boolean {
    return this.secondsLeft > 0;
  }

  /** Starts (or restarts) the countdown. Zero or less ends it. */
  start(seconds: number): void {
    this.stopTimer();
    this.endsAt = this.now() + seconds * 1000;
    this.secondsLeft = Math.max(0, Math.ceil(seconds));
    if (this.secondsLeft > 0) {
      this.timer = setInterval(this.tick, TICK_MS);
    }
  }

  /** Ends the countdown now. Safe to call more than once. */
  dispose(): void {
    this.stopTimer();
    this.secondsLeft = 0;
  }

  // Runs from a timer, outside any action; an auto-bound method of a `makeAutoObservable` class is one itself.
  private tick(): void {
    this.secondsLeft = Math.max(0, Math.ceil((this.endsAt - this.now()) / 1000));
    if (this.secondsLeft === 0) {
      this.stopTimer();
    }
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
