import { makeAutoObservable } from 'mobx';

/**
 * The server's time, as well as this phone can tell. A phone's clock can be seconds or minutes off, so anything
 * measured against a time the server sent (how long the current team has been answering) uses `now()`, never the
 * phone's own clock.
 *
 * Every snapshot carries the server's clock (`serverNow`); `sync` keeps the difference. The message's travel time
 * makes the estimate a few milliseconds late, which no screen can show.
 */
export class ServerClock {
  /** Server time minus this phone's time, in milliseconds. 0 until the first snapshot. */
  offsetMs = 0;

  private readonly localNow: () => number;

  /** `localNow` is the phone's clock in milliseconds; a test passes its own. */
  constructor(localNow: () => number = () => Date.now()) {
    this.localNow = localNow;
    makeAutoObservable<ServerClock, 'localNow'>(this, { localNow: false }, { autoBind: true });
  }

  /** `serverNow` is an ISO date from a snapshot. One that can't be read changes nothing. */
  sync(serverNow: string): void {
    const serverMs = Date.parse(serverNow);
    if (!Number.isNaN(serverMs)) {
      this.offsetMs = serverMs - this.localNow();
    }
  }

  /** The server's time now, in milliseconds since 1970 (like `Date.now()`). */
  now(): number {
    return this.localNow() + this.offsetMs;
  }
}
