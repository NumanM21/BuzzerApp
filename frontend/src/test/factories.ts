import type {
  Adjustment,
  EventInfo,
  FinalizeResponse,
  JoinTeam,
  Me,
  Member,
  Player,
  PlayerScore,
  ProblemDetails,
  Team,
  TeamScore,
} from '@/api/types';

// Test data with neutral names ("Team 1", "Player 7") and as many teams or players as a test asks for. Tests never
// use a real year's teams: the count, names, colours and icons change every year.

export function makeMembers(count: number, firstPlayerId = 1): Member[] {
  return Array.from({ length: count }, (_, index) => {
    const playerId = firstPlayerId + index;
    return { playerId, displayName: `Player ${playerId}`, realName: null };
  });
}

interface MakeTeamsOptions {
  membersPerTeam?: number;
}

/**
 * `count` teams in display order. Colour and icon keys are neutral (`color-1`, `icon-1`) and belong to no pack, so
 * a component under test shows the pack's fallback for them, which is what an unknown key must do.
 */
export function makeTeams(count: number, { membersPerTeam = 0 }: MakeTeamsOptions = {}): Team[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return {
      id,
      name: `Team ${id}`,
      colorKey: `color-${id}`,
      iconKey: `icon-${id}`,
      sortOrder: id,
      members: makeMembers(membersPerTeam, index * membersPerTeam + 1),
    };
  });
}

export function makeEventInfo(overrides: Partial<EventInfo> = {}): EventInfo {
  return { name: 'Games Night', year: 2030, themeKey: 'default', ...overrides };
}

export function makeJoinTeams(count: number, membersPerTeam = 0): JoinTeam[] {
  return makeTeams(count).map(({ id, name, colorKey, iconKey }) => ({
    id,
    name,
    colorKey,
    iconKey,
    memberCount: membersPerTeam,
  }));
}

export function makeMe(overrides: Partial<Me> = {}): Me {
  return {
    playerId: 1,
    realName: 'Real Name 1',
    displayName: 'Player 1',
    role: 'player',
    teamId: 1,
    teamName: 'Team 1',
    ...overrides,
  };
}

/** An admin has no team. */
export function makeAdminMe(overrides: Partial<Me> = {}): Me {
  return makeMe({ role: 'admin', teamId: null, teamName: null, ...overrides });
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 1,
    realName: 'Real Name 1',
    displayName: 'Player 1',
    role: 'player',
    teamId: 1,
    teamName: 'Team 1',
    ...overrides,
  };
}

/** `count` players spread over the teams (the first `teamCount` ids) in turn. */
export function makePlayers(count: number, teamCount = 1): Player[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const teamId = (index % teamCount) + 1;
    return makePlayer({ id, realName: `Real Name ${id}`, displayName: `Player ${id}`, teamId, teamName: `Team ${teamId}` });
  });
}

/**
 * Scores in the server's order: total descending, then team order. Totals fall by `pointsStep` per place; with a
 * step of 0 every team ties, and they all share rank 1.
 */
export function makeTeamScores(count: number, pointsStep = 10): TeamScore[] {
  return makeTeams(count).map((team, index) => ({
    teamId: team.id,
    name: team.name,
    colorKey: team.colorKey,
    iconKey: team.iconKey,
    total: (count - index) * pointsStep,
    rank: pointsStep === 0 ? 1 : index + 1,
  }));
}

/** Players in the server's order: total descending, then display name. */
export function makePlayerScores(count: number, teamCount = 1): PlayerScore[] {
  return makePlayers(count, teamCount).map((player, index) => ({
    playerId: player.id,
    displayName: player.displayName,
    realName: player.realName,
    teamId: player.teamId,
    teamName: player.teamName,
    total: (count - index) * 5,
  }));
}

/** Newest first, as the server sends them. Every row adds points to a team. */
export function makeAdjustments(count: number): Adjustment[] {
  return Array.from({ length: count }, (_, index) => {
    const id = count - index;
    return {
      id,
      target: 'team',
      targetId: 1,
      targetName: 'Team 1',
      amount: id * 10,
      reason: null,
      reversesAdjustmentId: null,
      isReversed: false,
      createdAt: new Date(Date.UTC(2030, 0, 1, 20, id)).toISOString(),
      createdByDisplayName: 'Host',
    };
  });
}

export function makeFinalizeResponse(overrides: Partial<FinalizeResponse> = {}): FinalizeResponse {
  return { eventId: 1, year: 2030, schemaVersion: 1, finalizedAt: '2030-01-01T23:00:00.000Z', ...overrides };
}

interface ProblemOptions {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

/** The body of a failed call, as the server's ProblemDetails. */
export function problem(status: number, { title, detail, errors }: ProblemOptions = {}): ProblemDetails {
  return { title: title ?? `Problem ${status}`, status, ...(detail && { detail }), ...(errors && { errors }) };
}
