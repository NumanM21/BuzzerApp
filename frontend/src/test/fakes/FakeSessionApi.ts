import { ApiError } from '@/api/ApiError';
import type { SessionApi } from '@/api/SessionApi';
import type { Me, RegisterRequest, SignInRequest } from '@/api/types';
import { CallRecorder } from './CallRecorder';

/**
 * In-memory `SessionApi`. `me` is who the cookie belongs to (`undefined`: nobody, so `getMe` answers 401).
 * `accounts` are the players that can sign in, by real name. `failNext(error)` makes the next call reject.
 */
export class FakeSessionApi implements SessionApi {
  me: Me | undefined;
  accounts: Me[] = [];

  private readonly recorder = new CallRecorder();

  get calls(): readonly string[] {
    return this.recorder.calls;
  }

  failNext(error: Error): void {
    this.recorder.failNext(error);
  }

  /** Forgets the calls so far, to assert only on what a later step did. */
  clearCalls(): void {
    this.recorder.clearCalls();
  }

  register(request: RegisterRequest): Promise<Me> {
    return this.recorder.run('register', () => {
      const me: Me = {
        playerId: this.accounts.length + 1,
        realName: request.realName,
        displayName: request.displayName,
        role: 'player',
        teamId: request.teamId,
        teamName: `Team ${request.teamId}`,
      };
      this.accounts.push(me);
      this.me = me;
      return me;
    });
  }

  signIn(request: SignInRequest): Promise<Me> {
    return this.recorder.run('signIn', () => {
      const account = this.accounts.find((candidate) => candidate.realName === request.realName);
      if (!account) {
        throw new ApiError({ status: 401, kind: 'unauthorized', detail: 'Real name or PIN is incorrect.' });
      }
      this.me = account;
      return account;
    });
  }

  signOut(): Promise<void> {
    return this.recorder.run('signOut', () => {
      this.me = undefined;
    });
  }

  getMe(): Promise<Me> {
    return this.recorder.run('getMe', () => {
      if (!this.me) {
        throw new ApiError({ status: 401, kind: 'unauthorized' });
      }
      return this.me;
    });
  }
}
