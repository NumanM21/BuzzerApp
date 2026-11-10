import type { ApiClient } from './ApiClient';
import type { Me, RegisterRequest, SignInRequest } from './types';

export interface SessionApi {
  register(request: RegisterRequest): Promise<Me>;
  signIn(request: SignInRequest): Promise<Me>;
  signOut(): Promise<void>;
  /** The signed-in player, read from the database. Rejects with kind `unauthorized` when the session has ended. */
  getMe(): Promise<Me>;
}

export class HttpSessionApi implements SessionApi {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  register(request: RegisterRequest): Promise<Me> {
    return this.client.post<Me>('/api/session/register', request, { anonymous: true });
  }

  // A 401 here means "wrong name or PIN", not "session ended", hence anonymous.
  signIn(request: SignInRequest): Promise<Me> {
    return this.client.post<Me>('/api/session/signin', request, { anonymous: true });
  }

  signOut(): Promise<void> {
    return this.client.post('/api/session/signout');
  }

  // Anonymous because its caller (`SessionStore`) reads a 401 as "not signed in" or "session ended" itself.
  getMe(): Promise<Me> {
    return this.client.get<Me>('/api/session/me', { anonymous: true });
  }
}
