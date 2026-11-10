import { describe, expect, it } from 'vitest';
import { navItemsFor } from './navigation';
import { appPaths } from './paths';

describe('navItemsFor', () => {
  it('gives a player Buzz, Teams and Scores', () => {
    expect(navItemsFor('player').map(({ label, path }) => [label, path])).toEqual([
      ['Buzz', appPaths.play],
      ['Teams', appPaths.teams],
      ['Scores', appPaths.scores],
    ]);
  });

  it('gives an admin Host, Teams, Scores and Event, and no Buzz', () => {
    expect(navItemsFor('admin').map(({ label, path }) => [label, path])).toEqual([
      ['Host', appPaths.adminHost],
      ['Teams', appPaths.teams],
      ['Scores', appPaths.adminScores],
      ['Event', appPaths.adminEvent],
    ]);
  });

  it.each(['player', 'admin'] as const)('has unique keys and paths for %s, and no path with a dot', (role) => {
    const items = navItemsFor(role);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.path)).size).toBe(items.length);
    expect(items.every((item) => !item.path.includes('.'))).toBe(true);
  });
});
