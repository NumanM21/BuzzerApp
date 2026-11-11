import { describe, expect, it } from 'vitest';
import { freeColorKeys, otherTeams } from './teamChoices';

const teamsOf = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, colorKey: `color-${i + 1}` }));

describe('otherTeams', () => {
  it.each([1, 2, 6, 13])('leaves out the current team among %i, keeping the order', (count) => {
    const result = otherTeams(teamsOf(count), 1);
    expect(result.map((team) => team.id)).toEqual(Array.from({ length: count - 1 }, (_, i) => i + 2));
  });

  it('keeps every team for a player without a team', () => {
    expect(otherTeams(teamsOf(3), null)).toHaveLength(3);
  });

  it('keeps every team when the current team is not in the list', () => {
    expect(otherTeams(teamsOf(3), 99)).toHaveLength(3);
  });
});

describe('freeColorKeys', () => {
  const packKeys = ['color-1', 'color-2', 'color-3', 'color-4'];

  it('drops the colours teams use, keeping the pack order', () => {
    expect(freeColorKeys(packKeys, teamsOf(2))).toEqual(['color-3', 'color-4']);
  });

  it('offers everything when there are no teams', () => {
    expect(freeColorKeys(packKeys, [])).toEqual(packKeys);
  });

  it('offers nothing when every colour is used', () => {
    expect(freeColorKeys(packKeys, teamsOf(4))).toEqual([]);
  });

  it('ignores a team colour the pack does not have', () => {
    expect(freeColorKeys(packKeys, [{ colorKey: 'old-pack-colour' }])).toEqual(packKeys);
  });
});
