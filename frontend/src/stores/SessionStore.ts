import { makeAutoObservable, observableRef } from 'mobx';
import { ApiError } from '@/api/ApiError';
import type { Me, RegisterRequest, SignInRequest } from '@/api/types';
import type { SessionApi } from '@/api/SessionApi';

export type SessionStatus = 'unknown' | 'anonymous' | 'signedIn';

/**
 * Who is using this phone. `unknown` only until `restore()` has asked the server whether the cookie is still good.
 *
 * `latest` numbers every `/me` request and every sign-in, sign-out or expiry. A `/me` answer is applied only if
 * nothing newer has happened since it was asked: a slow `restore()` can't undo a sign-in that came after it, and
 * of two overlapping refreshes the later one wins.
 */
export class SessionStore {
  me: Me | undefined = undefined;
  status: SessionStatus = 'unknown';
  /** Why `restore()` could not tell (server down). `undefined` once the server answered. */
  error: Error | undefined = undefined;

  private readonly api: SessionApi;
  private latest = 0;

  constructor(api: SessionApi) {
    this.api = api;
    makeAutoObservable<SessionStore, 'api' | 'latest'>(
      this,
      { me: observableRef, error: observableRef, api: false, latest: false },
      { autoBind: true },
    );
  }

  get isAdmin(): boolean {
    return this.me?.role === 'admin';
  }

  /**
   * Asks the server who the cookie belongs to. A 401 means nobody (anonymous). Any other failure leaves the status
   * `unknown` and sets `error`, so a guard can offer "try again" instead of sending a signed-in person to the join
   * screen because the server was briefly unreachable. Never rejects.
   */
  async restore(): Promise<void> {
    const request = this.startRequest();
    try {
      const me = await this.api.getMe();
      this.applyIfCurrent(request, () => this.setSignedIn(me));
    } catch (reason) {
      this.applyIfCurrent(request, () => {
        if (reason instanceof ApiError && reason.kind === 'unauthorized') {
          this.setAnonymous();
        } else {
          this.error = reason instanceof Error ? reason : new Error('Could not check the session.');
        }
      });
    }
  }

  /** Both rethrow the `ApiError` (a taken name, a wrong PIN, too many tries) for the join screen to show. */
  async register(request: RegisterRequest): Promise<void> {
    const me = await this.api.register(request);
    this.latest += 1;
    this.setSignedIn(me);
  }

  async signIn(request: SignInRequest): Promise<void> {
    const me = await this.api.signIn(request);
    this.latest += 1;
    this.setSignedIn(me);
  }

  /**
   * Ends the session. If the session had already ended (401) that is the goal reached. Any other failure rethrows
   * and leaves the person signed in, since the server still thinks so.
   */
  async signOut(): Promise<void> {
    try {
      await this.api.signOut();
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.kind === 'unauthorized')) {
        throw reason;
      }
    }
    this.latest += 1;
    this.setAnonymous();
  }

  /**
   * Re-reads the names, team and role (after an edit, or when the hub says they changed). Never rejects: a failure
   * keeps the `me` already known, and an ended session (401) signs the person out.
   */
  async refresh(): Promise<void> {
    const request = this.startRequest();
    try {
      const me = await this.api.getMe();
      this.applyIfCurrent(request, () => this.setSignedIn(me));
    } catch (reason) {
      if (reason instanceof ApiError && reason.kind === 'unauthorized') {
        this.applyIfCurrent(request, this.setAnonymous);
      }
    }
  }

  /** `ApiClient` calls this when a call that needs a session gets a 401. */
  handleSessionExpired(): void {
    this.latest += 1;
    this.setAnonymous();
  }

  private startRequest(): number {
    this.latest += 1;
    return this.latest;
  }

  private setSignedIn(me: Me): void {
    this.me = me;
    this.status = 'signedIn';
    this.error = undefined;
  }

  private setAnonymous(): void {
    this.me = undefined;
    this.status = 'anonymous';
    this.error = undefined;
  }

  // A method of an auto-observable class is an action, so the change is allowed even though callers are after an
  // `await`.
  private applyIfCurrent(request: number, change: () => void): void {
    if (request === this.latest) {
      change();
    }
  }
}
