import { describe, expect, it } from 'vitest';
import { formatScore } from './formatScore';

describe('formatScore', () => {
  it.each([
    [120, 5, '00120'],
    [0, 5, '00000'],
    [123456, 5, '123456'],
    [120, 0, '120'],
    [-12, 5, '-00012'],
    [-12, 0, '-12'],
    [7, 1, '7'],
  ])('formats %i with %i digits as "%s"', (score, digits, expected) => {
    expect(formatScore(score, digits)).toBe(expected);
  });
});
