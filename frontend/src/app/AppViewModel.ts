import { makeAutoObservable } from 'mobx';
import type { EventStore } from '@/stores/EventStore';
import type { SessionStore } from '@/stores/SessionStore';
import { DEFAULT_THEME_KEY } from '@/theme/registry';

/**
 * The app's start-up: ask the server which event is active (that decides the theme) and whether this phone is
 * already signed in. Everything else waits for the theme, so the default look never flashes before the event's.
 */
export class AppViewModel {
  private readonly event: EventStore;
  private readonly session: SessionStore;

  constructor(event: EventStore, session: SessionStore) {
    this.event = event;
    this.session = session;
    makeAutoObservable<AppViewModel, 'event' | 'session'>(this, { event: false, session: false }, { autoBind: true });
  }

  // `ensureLoaded` joins a load already running, so StrictMode's second activation doesn't send a second request.
  activate(): void {
    void this.event.ensureLoaded();
    void this.session.restore();
  }

  /** False while the event is loading: the theme isn't known yet. A failed load counts as ready (default theme). */
  get isReady(): boolean {
    return this.event.isSettled;
  }

  /** The event's theme, or the default pack when the event couldn't be loaded. */
  get themeKey(): string {
    return this.event.themeKey ?? DEFAULT_THEME_KEY;
  }
}
