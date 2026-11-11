import { describe, expect, it } from 'vitest';
import { makeTeamQueue } from '@/test/factories';
import { buildQueueRows, teamLooksById, UNKNOWN_TEAM_KEY, type TeamLook } from './queueRows';

function looksFor(teamIds: readonly number[]): Map<number, TeamLook> {
  return new Map(teamIds.map((id) => [id, { colorKey: `color-${id}`, iconKey: `icon-${id}` }]));
}

describe('buildQueueRows', () => {
  it.each([1, 2, 6, 13])('keeps the order the server sent, for %i teams', (count) => {
    // Descending ids: a row's place must come from the snapshot, never from the team's id.
    const ids = Array.from({ length: count }, (_, index) => count - index);

    const rows = buildQueueRows(makeTeamQueue(ids), undefined, looksFor(ids));

    expect(rows.map((row) => row.teamId)).toEqual(ids);
    expect(rows.map((row) => row.position)).toEqual(ids.map((_, index) => index + 1));
  });

  it('takes the name and the buzzer from the snapshot and the keys from the teams list', () => {
    const queue = makeTeamQueue([4, 2], (index) => (index === 0 ? 'current' : 'waiting'));

    const [first, second] = buildQueueRows(queue, 2, looksFor([4, 2]));

    expect(first).toEqual({
      teamId: 4,
      position: 1,
      teamName: 'Team 4',
      buzzedBy: 'Player 40',
      status: 'current',
      isMine: false,
      colorKey: 'color-4',
      iconKey: 'icon-4',
    });
    expect(second).toMatchObject({ teamId: 2, status: 'waiting', isMine: true, colorKey: 'color-2' });
  });

  it('shows the snapshot name even when the team has been renamed since', () => {
    const looks = looksFor([1]);

    const [row] = buildQueueRows(makeTeamQueue([1]), 1, looks);

    expect(row.teamName).toBe('Team 1');
  });

  it('keeps a row for a team the teams list does not have, with the fallback keys', () => {
    const rows = buildQueueRows(makeTeamQueue([1, 2, 3]), 3, looksFor([1, 3]));

    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ teamId: 2, teamName: 'Team 2', colorKey: UNKNOWN_TEAM_KEY, iconKey: UNKNOWN_TEAM_KEY });
  });

  it.each([null, undefined])('marks no row as mine when the person has no team (%s)', (myTeamId) => {
    const rows = buildQueueRows(makeTeamQueue([1, 2]), myTeamId, looksFor([1, 2]));

    expect(rows.some((row) => row.isMine)).toBe(false);
  });

  it('is empty for an empty queue', () => {
    expect(buildQueueRows([], 1, looksFor([1]))).toEqual([]);
  });
});

describe('teamLooksById', () => {
  it.each([0, 1, 6, 13])('gives every one of %i teams its own colour and icon key', (count) => {
    const teams = Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      name: `Team ${index + 1}`,
      colorKey: `colour-${index + 1}`,
      iconKey: `icon-${index + 1}`,
    }));

    const looks = teamLooksById(teams);

    expect(looks.size).toBe(count);
    for (const team of teams) {
      expect(looks.get(team.id)).toEqual({ colorKey: team.colorKey, iconKey: team.iconKey });
    }
  });

  it('knows nothing of a team that is not in the list', () => {
    expect(teamLooksById([{ id: 1, colorKey: 'colour-1', iconKey: 'icon-1' }]).get(2)).toBeUndefined();
  });
});
