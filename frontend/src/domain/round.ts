// The live round as the server describes it (the hub's snapshots). The types live in domain/ because the buzzer
// rule below them is written in terms of them; `realtime/types.ts` builds the full snapshot types on top.

/** `idle` (no question) → Begin → `open` (buzzing) → `locked` (one team answering) → … → `exhausted` (all passed). */
export type RoundPhase = 'idle' | 'open' | 'locked' | 'exhausted';

/** A queued team's turn: still to come, answering now, or answered wrong. */
export type TeamTurnStatus = 'waiting' | 'current' | 'passed';

/** One team in the queue, in buzz order. The team name is the one it had when the round began. */
export interface TeamQueueEntry {
  position: number;
  teamId: number;
  teamName: string;
  buzzedByDisplayName: string;
  status: TeamTurnStatus;
}

/** What the buzzer rule needs from a snapshot. */
export interface RoundView {
  phase: RoundPhase;
  teamQueue: readonly TeamQueueEntry[];
}
