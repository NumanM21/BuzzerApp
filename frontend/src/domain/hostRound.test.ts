import { describe, expect, it } from 'vitest';
import type { RoundPhase } from './round';
import {
  describeRoundPhase,
  formatBuzzLine,
  formatBuzzOffset,
  formatElapsed,
  hostActionsAllowedIn,
} from './hostRound';

describe('hostActionsAllowedIn', () => {
  it.each<[RoundPhase, boolean, boolean, boolean]>([
    ['idle', true, false, false],
    ['open', false, false, true],
    ['locked', false, true, true],
    ['exhausted', false, false, true],
  ])('in %s: begin %s, next team %s, reset %s', (phase, begin, next, reset) => {
    expect(hostActionsAllowedIn(phase)).toEqual({ beginRound: begin, nextTeam: next, resetRound: reset });
  });
});

describe('describeRoundPhase', () => {
  it.each<[RoundPhase, string]>([
    ['idle', 'No question in play'],
    ['open', 'Waiting for buzzes'],
    ['locked', 'Locked'],
    ['exhausted', 'Every team has passed'],
  ])('puts %s in words', (phase, text) => {
    expect(describeRoundPhase(phase)).toBe(text);
  });
});

describe('formatBuzzOffset', () => {
  it.each([
    [0, '+0.00s'],
    [210, '+0.21s'],
    [5, '+0.01s'],
    [4, '+0.00s'],
    [995, '+1.00s'],
    [1005, '+1.01s'],
    [1234, '+1.23s'],
    [12_000, '+12.00s'],
    [-30, '+0.00s'],
  ])('%i ms reads %s', (offsetMs, text) => {
    expect(formatBuzzOffset(offsetMs)).toBe(text);
  });
});

describe('formatBuzzLine', () => {
  const buzz = { sequence: 1, displayName: 'Alice', teamName: 'Team 1', offsetMs: 0, countedForTeam: true };

  it('shows place, player, team and offset', () => {
    expect(formatBuzzLine(buzz)).toBe('#1 Alice (Team 1) +0.00s');
  });

  it("says in words that a teammate's later buzz was not counted", () => {
    expect(formatBuzzLine({ ...buzz, sequence: 2, displayName: 'Bob', offsetMs: 210, countedForTeam: false })).toBe(
      '#2 Bob (Team 1) +0.21s · not counted',
    );
  });

  it('keeps the longest names whole', () => {
    const line = formatBuzzLine({ ...buzz, displayName: 'D'.repeat(20), teamName: 'T'.repeat(24) });
    expect(line).toBe(`#1 ${'D'.repeat(20)} (${'T'.repeat(24)}) +0.00s`);
  });
});

describe('formatElapsed', () => {
  it.each([
    [0, '0:00.0'],
    [99, '0:00.0'],
    [100, '0:00.1'],
    [7_450, '0:07.4'],
    [59_999, '0:59.9'],
    [60_000, '1:00.0'],
    [65_000, '1:05.0'],
    [600_000, '10:00.0'],
    [-250, '0:00.0'],
  ])('%i ms reads %s', (elapsedMs, text) => {
    expect(formatElapsed(elapsedMs)).toBe(text);
  });
});
