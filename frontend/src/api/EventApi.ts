import type { ApiClient } from './ApiClient';
import type { EventInfo, JoinTeam } from './types';

export interface EventApi {
  /** The active event. Rejects with kind `notFound` when there is none. */
  getEvent(): Promise<EventInfo>;
  /** The teams a new player can join, in display order. Needs the join code, not a session. */
  getJoinTeams(joinCode: string): Promise<JoinTeam[]>;
}

export class HttpEventApi implements EventApi {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  getEvent(): Promise<EventInfo> {
    return this.client.get<EventInfo>('/api/event', { anonymous: true });
  }

  getJoinTeams(joinCode: string): Promise<JoinTeam[]> {
    return this.client.get<JoinTeam[]>('/api/event/teams', { anonymous: true, query: { code: joinCode } });
  }
}
