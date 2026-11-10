import { makeAutoObservable, observableRef, runInAction } from 'mobx';
import { toError } from './toError';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * One piece of server data and the state of loading it, for a store or view model to own.
 *
 * - A reload keeps the previous `value` while it runs, so a screen that reloads because the hub said "changed"
 *   doesn't flicker to empty. A failed reload keeps it too: stale data plus an error beats a blank screen.
 * - When loads overlap, the one started last wins. A slow early response that arrives after a newer one is
 *   dropped, so it can never overwrite fresher data.
 * - `load()` never rejects: a failure becomes `status: 'error'` and `error`, so callers can `void` it.
 */
export class Loadable<T> {
  value: T | undefined = undefined;
  status: LoadStatus = 'idle';
  error: Error | undefined = undefined;

  private readonly fetcher: () => Promise<T>;
  // Counts load() calls so a response can tell whether it still belongs to the latest one.
  private latestRequest = 0;
  // The latest load while it runs, so ensureLoaded() can join it instead of starting another.
  private pending: Promise<void> | undefined = undefined;

  constructor(fetcher: () => Promise<T>) {
    this.fetcher = fetcher;
    makeAutoObservable<Loadable<T>, 'fetcher' | 'latestRequest' | 'pending'>(
      this,
      {
        // Server data is replaced, never changed in place, so MobX only needs to watch the reference. That also
        // keeps `value` the exact object the API returned.
        value: observableRef,
        error: observableRef,
        fetcher: false,
        latestRequest: false,
        pending: false,
      },
      { autoBind: true },
    );
  }

  get isLoading(): boolean {
    return this.status === 'loading';
  }

  /** Loads now, even if a value is already there (a reload). */
  load(): Promise<void> {
    this.latestRequest += 1;
    const request = this.latestRequest;
    this.status = 'loading';
    const pending = this.fetchAndStore(request);
    this.pending = pending;
    return pending;
  }

  /** Loads unless a value is already there or a load is already running; retries after an error. */
  ensureLoaded(): Promise<void> {
    if (this.status === 'ready') {
      return Promise.resolve();
    }
    if (this.status === 'loading' && this.pending) {
      return this.pending;
    }
    return this.load();
  }

  private async fetchAndStore(request: number): Promise<void> {
    try {
      const value = await this.fetcher();
      // Code after an `await` is outside the action this method started in, hence runInAction.
      runInAction(() => {
        if (request !== this.latestRequest) {
          return;
        }
        this.value = value;
        this.error = undefined;
        this.status = 'ready';
      });
    } catch (reason) {
      runInAction(() => {
        if (request !== this.latestRequest) {
          return;
        }
        this.error = toError(reason);
        this.status = 'error';
      });
    } finally {
      if (request === this.latestRequest) {
        this.pending = undefined;
      }
    }
  }
}
