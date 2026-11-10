import type { BuzzerVisualState } from './buzzer';
import type { RoundView } from './round';

/** The buzzer for one player: its look, and for a team in the queue, where it stands and who buzzed for it. */
export interface BuzzerStatus {
  state: BuzzerVisualState;
  /** The team's place in the queue, as the server numbered it. Set whenever the team is in the queue. */
  position?: number;
  /** The teammate whose buzz put the team in the queue. Set whenever the team is in the queue. */
  buzzedBy?: string;
}

/**
 * Turns the latest snapshot into the buzzer's state for a player on `myTeamId`. The client never decides anything
 * about the round itself (whether it has locked, whose turn is next): it only reads the snapshot.
 *
 * `ready` is the only state in which the buzzer can be pressed. No snapshot, no team (an admin, or someone the
 * server hasn't put on a team) and an idle round are all `waiting`.
 */
export function getBuzzerState(round: RoundView | undefined, myTeamId: number | null | undefined): BuzzerStatus {
  if (round === undefined || round.phase === 'idle' || myTeamId === null || myTeamId === undefined) {
    return { state: 'waiting' };
  }

  const entry = round.teamQueue.find((candidate) => candidate.teamId === myTeamId);
  if (entry === undefined) {
    // Not in the queue: free to buzz while buzzing is open, otherwise this round is over for the team.
    return { state: round.phase === 'open' ? 'ready' : 'waiting' };
  }

  const inQueue = { position: entry.position, buzzedBy: entry.buzzedByDisplayName };
  switch (entry.status) {
    case 'current':
      return { state: 'yourTeamUp', ...inQueue };
    case 'waiting':
      return { state: 'queued', ...inQueue };
    case 'passed':
      return { state: 'out', ...inQueue };
  }
}
