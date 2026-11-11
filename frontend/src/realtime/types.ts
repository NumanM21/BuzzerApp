import type { RoundPhase, TeamQueueEntry } from '@/domain/round';

// The hub's messages (FrontendSteps Appendix A, "Hub"), exactly as they arrive. Dates are ISO strings.

export type { ConnectionState } from '@/domain/connectionNotice';
export type { RoundPhase, TeamQueueEntry, TeamTurnStatus } from '@/domain/round';

/** Sent to everyone after every change, and once to each connection when it connects. */
export interface PublicRoundSnapshot {
  /** Rises by 1 with every change. Restarts near zero when the server restarts. */
  version: number;
  /** `null` while idle. */
  roundId: string | null;
  phase: RoundPhase;
  roundStartedAt: string | null;
  /** In buzz order; one entry per team. */
  teamQueue: TeamQueueEntry[];
  currentTeamId: number | null;
  /** Set after the first buzz while open. At most a cosmetic countdown: the server decides when the round locks. */
  windowEndsAt: string | null;
  /** The server's clock when the snapshot was made. */
  serverNow: string;
}

/** One press of a buzzer. Admin snapshots only. */
export interface BuzzEntry {
  sequence: number;
  playerId: number;
  displayName: string;
  teamId: number;
  teamName: string;
  /** Milliseconds after the round's first buzz. */
  offsetMs: number;
  /** False for a teammate's later buzz: the team was already in the queue. */
  countedForTeam: boolean;
}

/** Sent to admins only, as its own message with its own `version` sequence. */
export interface AdminRoundSnapshot extends PublicRoundSnapshot {
  /** Every buzz in arrival order, teammates' later ones included. */
  buzzes: BuzzEntry[];
  /** When the current team's turn began. */
  currentSince: string | null;
}

/** The answer to `Buzz`, `BeginRound`, `NextTeam` and `ResetRound`. `error` is a code (`round.notOpen`, …). */
export interface RoundResult {
  success: boolean;
  error: string | null;
  /** Don't act on it: the snapshot that follows is the truth. */
  changed: boolean;
}

