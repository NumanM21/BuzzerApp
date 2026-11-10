import type { ApiClient } from './ApiClient';
import type { CreateTeamRequest, Team, TeamSummary } from './types';

export interface TeamsApi {
  /** Teams in display order, members by display name. Real names only for admins and the caller's own row. */
  getTeams(): Promise<Team[]>;
  createTeam(request: CreateTeamRequest): Promise<TeamSummary>;
  renameTeam(teamId: number, name: string): Promise<TeamSummary>;
  deleteTeam(teamId: number): Promise<void>;
}

export class HttpTeamsApi implements TeamsApi {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  getTeams(): Promise<Team[]> {
    return this.client.get<Team[]>('/api/teams');
  }

  createTeam(request: CreateTeamRequest): Promise<TeamSummary> {
    return this.client.post<TeamSummary>('/api/teams', request);
  }

  renameTeam(teamId: number, name: string): Promise<TeamSummary> {
    return this.client.patch<TeamSummary>(`/api/teams/${teamId}`, { name });
  }

  deleteTeam(teamId: number): Promise<void> {
    return this.client.delete(`/api/teams/${teamId}`);
  }
}
