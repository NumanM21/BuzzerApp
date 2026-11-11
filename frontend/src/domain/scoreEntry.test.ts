import { describe, expect, it } from 'vitest';
import {
  describeEntry,
  entryTotal,
  formatSignedPoints,
  parseWholeNumber,
  signedEntryTotal,
  validateAmount,
  validateMultiplier,
  validateReason,
  validateScoreTarget,
} from './scoreEntry';

describe('parseWholeNumber', () => {
  it.each([
    ['30', 30],
    ['  7 ', 7],
    ['007', 7],
    ['0', 0],
    ['', undefined],
    ['  ', undefined],
    ['1.5', undefined],
    ['-3', undefined],
    ['+3', undefined],
    ['1e3', undefined],
    ['12 pts', undefined],
    ['99999999999999999999', undefined],
  ])('"%s" → %s', (text, expected) => {
    expect(parseWholeNumber(text)).toBe(expected);
  });
});

describe('validateAmount', () => {
  it.each([
    ['1', undefined],
    ['500', undefined],
    ['0', 'Enter a whole number above 0'],
    ['', 'Enter a whole number above 0'],
    ['-5', 'Enter a whole number above 0'],
    ['2.5', 'Enter a whole number above 0'],
  ])('"%s" → %s', (text, expected) => {
    expect(validateAmount(text)).toBe(expected);
  });
});

describe('validateMultiplier', () => {
  it.each([
    ['1', undefined],
    ['100', undefined],
    ['0', 'Enter a whole number from 1 to 100'],
    ['101', 'Enter a whole number from 1 to 100'],
    ['', 'Enter a whole number from 1 to 100'],
    ['2.5', 'Enter a whole number from 1 to 100'],
  ])('"%s" → %s', (text, expected) => {
    expect(validateMultiplier(text)).toBe(expected);
  });
});

describe('validateReason', () => {
  it('allows nothing, and up to 200 characters after trimming', () => {
    expect(validateReason('')).toBeUndefined();
    expect(validateReason('x'.repeat(200))).toBeUndefined();
    expect(validateReason(`  ${'x'.repeat(200)}  `)).toBeUndefined();
  });

  it('refuses 201 characters', () => {
    expect(validateReason('x'.repeat(201))).toBe('Use at most 200 characters');
  });
});

describe('validateScoreTarget', () => {
  it('needs one target', () => {
    expect(validateScoreTarget(false)).toBe('Pick a team or a player');
    expect(validateScoreTarget(true)).toBeUndefined();
  });
});

describe('entryTotal', () => {
  it.each([
    ['10', '3', 30],
    ['10', '1', 10],
    ['1', '100', 100],
    ['10', '0', undefined],
    ['0', '3', undefined],
    ['', '3', undefined],
    ['10', '', undefined],
    ['ten', '3', undefined],
  ])('%s × %s → %s', (amount, multiplier, expected) => {
    expect(entryTotal(amount, multiplier)).toBe(expected);
  });
});

describe('formatSignedPoints', () => {
  it.each([
    [30, '+30'],
    [-30, '\u221230'],
    [0, '0'],
  ])('%i → %s', (points, expected) => {
    expect(formatSignedPoints(points)).toBe(expected);
  });
});

describe('signedEntryTotal', () => {
  it('adds a positive number and removes a negative one', () => {
    expect(signedEntryTotal(30, 'add')).toBe(30);
    expect(signedEntryTotal(30, 'remove')).toBe(-30);
  });
});

describe('describeEntry', () => {
  it('shows the sum only when a multiplier changes the amount', () => {
    expect(describeEntry({ amount: 10, multiplier: 1, targetName: 'Team 1' })).toBe('10 points for Team 1');
    expect(describeEntry({ amount: 10, multiplier: 3, targetName: 'Team 1' })).toBe('3 \u00D7 10 = 30 points for Team 1');
  });

  it('says "point" for one and leaves the target out until one is picked', () => {
    expect(describeEntry({ amount: 1, multiplier: 1, targetName: undefined })).toBe('1 point');
  });
});
