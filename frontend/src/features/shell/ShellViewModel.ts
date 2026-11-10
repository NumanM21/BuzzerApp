import { makeAutoObservable } from 'mobx';
import { navItemsFor, type NavItem } from '@/domain/navigation';
import { Command } from '@/mvvm/Command';
import type { EventStore } from '@/stores/EventStore';
import type { SessionStore } from '@/stores/SessionStore';

/** What the frame around every signed-in screen shows, and what its sign-out button does. */
export class ShellViewModel {
  private readonly event: EventStore;
  private readonly session: SessionStore;
  private readonly signOutCommand: Command;

  constructor(event: EventStore, session: SessionStore) {
    this.event = event;
    this.session = session;
    this.signOutCommand = new Command(() => this.session.signOut());
    makeAutoObservable<ShellViewModel, 'event' | 'session' | 'signOutCommand'>(
      this,
      { event: false, session: false, signOutCommand: false },
      { autoBind: true },
    );
  }

  /** Empty when the event could not be loaded; the layout then shows no title. */
  get eventName(): string {
    return this.event.event?.name ?? '';
  }

  get displayName(): string {
    return this.session.me?.displayName ?? '';
  }

  /** Empty only for the moment between signing out and the guard moving the person to the join screen. */
  get navItems(): readonly NavItem[] {
    const role = this.session.me?.role;
    return role === undefined ? [] : navItemsFor(role);
  }

  get isSigningOut(): boolean {
    return this.signOutCommand.isRunning;
  }

  /** Set when the server could not be reached: the person stays signed in, and says so. */
  get signOutError(): string | undefined {
    return this.signOutCommand.error?.message;
  }

  /** On success the session store becomes anonymous and the guards send the person to `/join`. */
  async signOut(): Promise<void> {
    await this.signOutCommand.run();
  }
}
