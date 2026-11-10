import { makeAutoObservable } from 'mobx';
import type { EventApi } from '@/api/EventApi';
import type { EventInfo } from '@/api/types';
import { Loadable, type LoadStatus } from '@/mvvm/Loadable';

/** The active event: its name, year and theme. Loaded once at start; it doesn't change while the app runs. */
export class EventStore {
  private readonly info: Loadable<EventInfo>;

  constructor(api: EventApi) {
    this.info = new Loadable(() => api.getEvent());
    makeAutoObservable<EventStore, 'info'>(this, { info: false }, { autoBind: true });
  }

  load(): Promise<void> {
    return this.info.load();
  }

  ensureLoaded(): Promise<void> {
    return this.info.ensureLoaded();
  }

  get status(): LoadStatus {
    return this.info.status;
  }

  get error(): Error | undefined {
    return this.info.error;
  }

  get event(): EventInfo | undefined {
    return this.info.value;
  }

  get themeKey(): string | undefined {
    return this.info.value?.themeKey;
  }

  /**
   * True once a load has finished, with the event or with an error; until then the theme isn't known. A retry
   * after an error doesn't make it false again, or the app would flash back to the splash.
   */
  get isSettled(): boolean {
    return this.info.value !== undefined || this.info.error !== undefined;
  }
}
