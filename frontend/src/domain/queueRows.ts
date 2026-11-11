import type { TeamQueueEntry, TeamTurnStatus } from './round';

/**
 * The colour and icon key a team has in the teams list. The queue's own entries carry neither: a snapshot only
 * knows the team's id and its name at Begin.
 */
export interface TeamLook {
  colorKey: string;
  iconKey: string;
}

/** The look of every team in the teams list, by team id: what `buildQueueRows` and the buzzer's colour are read from. */
export function teamLooksById(
  teams: readonly { id: number; colorKey: string; iconKey: string }[],
): ReadonlyMap<number, TeamLook> {
  return new Map(teams.map((team) => [team.id, { colorKey: team.colorKey, iconKey: team.iconKey }]));
}

/**
 * The key for a team the teams list doesn't have (deleted since Begin, or not loaded yet). It matches no pack's
 * key (they must be 1 to 50 characters), so the theme gives the team its fallback colour and icon.
 */
export const UNKNOWN_TEAM_KEY = '';

/** One line of the queue, ready to draw. */
export interface QueueRow {
  teamId: number;
  position: number;
  /** The name the team had when the round began, which is what the snapshot says. */
  teamName: string;
  buzzedBy: string;
  status: TeamTurnStatus;
  isMine: boolean;
  colorKey: string;
  iconKey: string;
}

/**
 * The snapshot's queue as rows, in the order the server sent them (the order is the buzz order: never re-sort it).
 * A team missing from `looks` still gets a row, with keys that show the pack's fallback visual.
 */
export function buildQueueRows(
  queue: readonly TeamQueueEntry[],
  myTeamId: number | null | undefined,
  looks: ReadonlyMap<number, TeamLook>,
): QueueRow[] {
  return queue.map((entry) => {
    const look = looks.get(entry.teamId);
    return {
      teamId: entry.teamId,
      position: entry.position,
      teamName: entry.teamName,
      buzzedBy: entry.buzzedByDisplayName,
      status: entry.status,
      isMine: entry.teamId === myTeamId,
      colorKey: look?.colorKey ?? UNKNOWN_TEAM_KEY,
      iconKey: look?.iconKey ?? UNKNOWN_TEAM_KEY,
    };
  });
}
