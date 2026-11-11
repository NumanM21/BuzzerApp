import { describe, expect, it } from 'vitest';
import { isRoundRunning, type RoundPhase } from './round';

describe('isRoundRunning', () => {
  it.each<[RoundPhase, boolean]>([
    ['idle', false],
    ['open', true],
    ['locked', true],
    ['exhausted', true],
  ])('phase %s -> %s', (phase, expected) => {
    expect(isRoundRunning({ phase })).toBe(expected);
  });

  it('is false before the first snapshot', () => {
    expect(isRoundRunning(undefined)).toBe(false);
  });
});
