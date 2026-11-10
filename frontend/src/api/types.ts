// The server's JSON shapes (docs/FrontendSteps.md Appendix A), written exactly as the server sends them: ids are
// numbers, dates are ISO 8601 strings (parsed where they are displayed), and a field that can be null says so.
// The hub's round snapshots are not here: F4 defines them next to the connection that delivers them.

export type PlayerRole = 'player' | 'admin';
export type ScoreTarget = 'team' | 'player';
export type ScoreDirection = 'add' | 'remove';

export interface EventInfo {
  name: string;
  year: number;
  themeKey: string;
}

/** A team as the join screen lists it (no session yet, so no members). */
export interface JoinTeam {
  id: number;
  name: string;
  colorKey: string;
  iconKey: string;
  memberCount: number;
}

export interface Me {
  playerId: number;
  realName: string;
  displayName: string;
  role: PlayerRole;
  teamId: number | null;
  teamName: string | null;
}

export interface Member {
  playerId: number;
  displayName: string;
  /** Present for admins and on the caller's own row only. */
  realName: string | null;
}

export interface Team {
  id: number;
  name: string;
  colorKey: string;
  iconKey: string;
  sortOrder: number;
  members: Member[];
}

export interface TeamSummary {
  id: number;
  name: string;
  colorKey: string;
  iconKey: string;
  sortOrder: number;
}

export interface Player {
  id: number;
  realName: string;
  displayName: string;
  role: PlayerRole;
  teamId: number | null;
  teamName: string | null;
}

export interface TeamScore {
  teamId: number;
  name: string;
  colorKey: string;
  iconKey: string;
  total: number;
  /** Equal totals share a rank: 1, 1, 3. */
  rank: number;
}

export interface PlayerScore {
  playerId: number;
  displayName: string;
  realName: string;
  teamId: number | null;
  teamName: string | null;
  total: number;
}

export interface Adjustment {
  id: number;
  target: ScoreTarget;
  targetId: number;
  targetName: string;
  /** Signed: negative for a removal or for the undo of an addition. */
  amount: number;
  reason: string | null;
  /** Set when this row is an undo. */
  reversesAdjustmentId: number | null;
  /** True when this row has been undone. */
  isReversed: boolean;
  createdAt: string;
  createdByDisplayName: string;
}

export interface FinalizeResponse {
  eventId: number;
  year: number;
  schemaVersion: number;
  finalizedAt: string;
}

// ---- Requests -------------------------------------------------------------------------------------------------

export interface RegisterRequest {
  joinCode: string;
  realName: string;
  displayName: string;
  pin: string;
  teamId: number;
}

export interface SignInRequest {
  joinCode: string;
  realName: string;
  pin: string;
}

export interface CreateTeamRequest {
  name: string;
  colorKey: string;
  iconKey: string;
}

/** A missing or null field is left unchanged; the server wants at least one. */
export interface UpdatePlayerNamesRequest {
  displayName?: string | null;
  realName?: string | null;
}

export interface AdjustmentRequest {
  target: ScoreTarget;
  targetId: number;
  /** A whole number above 0; `direction` carries the sign. */
  amount: number;
  /** 1 to 100. */
  multiplier: number;
  direction: ScoreDirection;
  reason?: string;
}

// ---- Errors ---------------------------------------------------------------------------------------------------

/** The body of a failed call (`application/problem+json`). Every field is optional: proxies send other bodies. */
export interface ProblemDetails {
  title?: string;
  status?: number;
  detail?: string;
  /** 400 validation only: the request's field name (camelCase) → messages. */
  errors?: Record<string, string[]>;
}
