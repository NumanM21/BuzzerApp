import { describe, expect, it } from 'vitest';
import { buildTeamScoreRows, type TeamScoreSource } from './scoreRows';

function scores(count: number, tied = false): TeamScoreSource[] {
  return Array.from({ length: count }, (_, index) => ({
    teamId: index + 1,
    name: `Team ${index + 1}`,
    colorKey: `color-${index + 1}`,
    iconKey: `icon-${index + 1}`,
    total: tied ? 10 : (count - index) * 10,
    rank: tied ? 1 : index + 1,
  }));
}

describe('buildTeamScoreRows', () => {
  it.each([0, 1, 2, 6, 13])('keeps the server\'s order and ranks with %i teams', (count) => {
    const rows = buildTeamScoreRows(scores(count), undefined);
    expect(rows.map((row) => row.teamId)).toEqual(scores(count).map((score) => score.teamId));
    expect(rows.map((row) => row.rank)).toEqual(scores(count).map((score) => score.rank));
  });

  it('shows shared ranks as sent, without counting places itself', () => {
    const sent: TeamScoreSource[] = [
      { ...scores(1)[0], teamId: 7, rank: 1, total: 50 },
      { ...scores(1)[0], teamId: 3, rank: 1, total: 50 },
      { ...scores(1)[0], teamId: 9, rank: 3, total: 20 },
    ];
    expect(buildTeamScoreRows(sent, undefined).map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it('marks only the viewer\'s team', () => {
    const rows = buildTeamScoreRows(scores(4), 3);
    expect(rows.map((row) => row.isMine)).toEqual([false, false, true, false]);
  });

  it.each([null, undefined])('marks no team for a viewer without one (%s)', (myTeamId) => {
    expect(buildTeamScoreRows(scores(3), myTeamId).some((row) => row.isMine)).toBe(false);
  });

  it('keeps a team that has all-equal totals', () => {
    expect(buildTeamScoreRows(scores(3, true), 2).map((row) => row.rank)).toEqual([1, 1, 1]);
  });
});
