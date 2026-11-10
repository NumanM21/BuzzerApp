import { ApiError } from '@/api/ApiError';
import type { TeamsApi } from '@/api/TeamsApi';
import type { CreateTeamRequest, Team, TeamSummary } from '@/api/types';
import { makeTeams } from '@/test/factories';
import { CallRecorder } from './CallRecorder';

function summaryOf({ id, name, colorKey, iconKey, sortOrder }: Team): TeamSummary {
  return { id, name, colorKey, iconKey, sortOrder };
}

/** In-memory `TeamsApi`. `failNext(error)` makes the next call reject; `calls` records what was called. */
export class FakeTeamsApi implements TeamsApi {
  teams: Team[] = makeTeams(3, { membersPerTeam: 2 });

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

  getTeams(): Promise<Team[]> {
    return this.recorder.run('getTeams', () => this.teams);
  }

  createTeam(request: CreateTeamRequest): Promise<TeamSummary> {
    return this.recorder.run('createTeam', () => {
      const id = Math.max(0, ...this.teams.map((team) => team.id)) + 1;
      const team: Team = { id, ...request, sortOrder: id, members: [] };
      this.teams = [...this.teams, team];
      return summaryOf(team);
    });
  }

  renameTeam(teamId: number, name: string): Promise<TeamSummary> {
    return this.recorder.run('renameTeam', () => {
      const renamed = { ...this.find(teamId), name };
      this.teams = this.teams.map((team) => (team.id === teamId ? renamed : team));
      return summaryOf(renamed);
    });
  }

  deleteTeam(teamId: number): Promise<void> {
    return this.recorder.run('deleteTeam', () => {
      if (this.find(teamId).members.length > 0) {
        throw new ApiError({ status: 409, kind: 'conflict', detail: 'The team still has players.' });
      }
      this.teams = this.teams.filter((team) => team.id !== teamId);
    });
  }

  private find(teamId: number): Team {
    const team = this.teams.find((candidate) => candidate.id === teamId);
    if (!team) {
      throw new ApiError({ status: 404, kind: 'notFound' });
    }
    return team;
  }
}
