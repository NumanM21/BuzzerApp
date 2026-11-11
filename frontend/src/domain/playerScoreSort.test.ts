import { describe, expect, it } from 'vitest';
import { isPlayerSortMode, sortPlayerScores, type SortablePlayerScore } from './playerScoreSort';

function row(playerId: number, displayName: string, teamId: number | null, total: number): SortablePlayerScore {
  return { playerId, displayName, teamId, total };
}

const ids = (rows: readonly SortablePlayerScore[]) => rows.map((r) => r.playerId);

describe('sortPlayerScores', () => {
  it('by team: the server\'s team order, then name, then id', () => {
    const rows = [
      row(1, 'Zed', 2, 5),
      row(2, 'amy', 1, 5),
      row(3, 'Bob', 2, 50),
      row(4, 'Amy', 1, 0), // same name as 2 apart from case: the id decides
      row(5, 'Cy', 3, 1),
    ];
    // Team 3 is listed first even though its id is the highest: the order is the list's, not the ids'.
    expect(ids(sortPlayerScores(rows, 'team', [3, 1, 2]))).toEqual([5, 2, 4, 3, 1]);
  });

  it('by team: players without a team, or on a team not in the order, come last', () => {
    const rows = [row(1, 'Ann', null, 9), row(2, 'Bea', 7, 9), row(3, 'Cy', 1, 0), row(4, 'Al', null, 0)];
    expect(ids(sortPlayerScores(rows, 'team', [1]))).toEqual([3, 4, 1, 2]);
  });

  it('by team with no team order at all: everyone is in the last group, ordered by name', () => {
    const rows = [row(1, 'Cy', 1, 0), row(2, 'Al', 2, 0), row(3, 'Bo', null, 0)];
    expect(ids(sortPlayerScores(rows, 'team', []))).toEqual([2, 3, 1]);
  });

  it('by score: highest first, ties by name then id, negatives last', () => {
    const rows = [row(1, 'Bo', 1, 10), row(2, 'Al', 1, 10), row(3, 'Cy', 1, -5), row(4, 'Al', 2, 10), row(5, 'Di', 1, 30)];
    expect(ids(sortPlayerScores(rows, 'score', []))).toEqual([5, 2, 4, 1, 3]);
  });

  it('by score ignores the team order', () => {
    const rows = [row(1, 'Bo', 1, 1), row(2, 'Al', 2, 2)];
    expect(ids(sortPlayerScores(rows, 'score', [1, 2]))).toEqual([2, 1]);
  });

  it('does not change the list it was given', () => {
    const rows = [row(2, 'B', 1, 1), row(1, 'A', 1, 2)];
    sortPlayerScores(rows, 'score', []);
    expect(ids(rows)).toEqual([2, 1]);
  });

  it('gives the same order whatever order the rows arrive in', () => {
    const rows = [row(1, 'Al', 1, 3), row(2, 'Al', 1, 3), row(3, 'al', 2, 3), row(4, 'Bo', null, 3)];
    const expected = ids(sortPlayerScores(rows, 'team', [1, 2]));
    expect(ids(sortPlayerScores([...rows].reverse(), 'team', [1, 2]))).toEqual(expected);
    expect(ids(sortPlayerScores([rows[2], rows[0], rows[3], rows[1]], 'team', [1, 2]))).toEqual(expected);
  });
});

describe('isPlayerSortMode', () => {
  it.each([
    ['team', true],
    ['score', true],
    ['name', false],
    ['', false],
  ])('%s → %s', (value, expected) => {
    expect(isPlayerSortMode(value)).toBe(expected);
  });
});
