import { makeAutoObservable } from 'mobx';
import { decideRoute, type RouteAccess, type RouteDecision } from '@/domain/routeAccess';
import { Command } from '@/mvvm/Command';
import type { EventStore } from '@/stores/EventStore';
import type { SessionStore } from '@/stores/SessionStore';

/**
 * What a guarded route does right now: let the person in, send them elsewhere, or wait until the session is known.
 * The rules are the pure `decideRoute`; this adds the "server unreachable" case, where the session can't be known
 * and the person is offered a retry rather than being sent to the join screen as if signed out.
 */
export class RouteGuardViewModel {
  private readonly access: RouteAccess;
  private readonly session: SessionStore;
  private readonly retryCommand: Command;

  constructor(session: SessionStore, event: EventStore, access: RouteAccess) {
    this.session = session;
    this.access = access;
    // When the server couldn't be reached as the app opened, the event (its name and theme) failed to load as well
    // as the session. Trying again asks for both, or the app would stay nameless in the default theme until someone
    // reloaded the page. `ensureLoaded` asks nothing when the event is already known. Neither call rejects.
    this.retryCommand = new Command(() => Promise.all([this.session.restore(), event.ensureLoaded()]));
    makeAutoObservable<RouteGuardViewModel, 'access' | 'session' | 'retryCommand'>(
      this,
      { access: false, session: false, retryCommand: false },
      { autoBind: true },
    );
  }

  get decision(): RouteDecision {
    return decideRoute(this.access, { status: this.session.status, role: this.session.me?.role });
  }

  /** Set while the session is unknown because the server couldn't be asked. */
  get unreachableMessage(): string | undefined {
    return this.decision.kind === 'wait' ? this.session.error?.message : undefined;
  }

  get isRetrying(): boolean {
    return this.retryCommand.isRunning;
  }

  async retry(): Promise<void> {
    await this.retryCommand.run();
  }
}
