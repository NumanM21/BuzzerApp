import type { ApiClient } from './ApiClient';
import type { Player, UpdatePlayerNamesRequest } from './types';

export interface PlayersApi {
  /** Admin only. By display name; includes admins. No MVP screen uses it yet. */
  getPlayers(): Promise<Player[]>;
  updateMyNames(request: UpdatePlayerNamesRequest): Promise<Player>;
  /** Admin only. */
  updatePlayerNames(playerId: number, request: UpdatePlayerNamesRequest): Promise<Player>;
  /** Admin only. Rejects with a validation error on field `teamId` for an unknown team or an admin target. */
  movePlayer(playerId: number, teamId: number): Promise<Player>;
  /** Admin only. The player becomes an admin and leaves their team. */
  promotePlayer(playerId: number): Promise<Player>;
}

export class HttpPlayersApi implements PlayersApi {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  getPlayers(): Promise<Player[]> {
    return this.client.get<Player[]>('/api/players');
  }

  updateMyNames(request: UpdatePlayerNamesRequest): Promise<Player> {
    return this.client.patch<Player>('/api/players/me', request);
  }

  updatePlayerNames(playerId: number, request: UpdatePlayerNamesRequest): Promise<Player> {
    return this.client.patch<Player>(`/api/players/${playerId}`, request);
  }

  movePlayer(playerId: number, teamId: number): Promise<Player> {
    return this.client.patch<Player>(`/api/players/${playerId}/team`, { teamId });
  }

  promotePlayer(playerId: number): Promise<Player> {
    return this.client.post<Player>(`/api/players/${playerId}/promote`);
  }
}
