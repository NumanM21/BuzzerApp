import { describe, expect, it } from 'vitest';
import { describeRateLimit, formatCount, isColourTakenMessage, isRealNameTakenMessage } from './text';

describe('formatCount', () => {
  it.each([
    [0, '0 players'],
    [1, '1 player'],
    [2, '2 players'],
    [13, '13 players'],
  ])('%i', (count, expected) => {
    expect(formatCount(count, 'player')).toBe(expected);
  });

  it('uses the given plural', () => {
    expect(formatCount(2, 'person', 'people')).toBe('2 people');
  });
});

describe('isRealNameTakenMessage', () => {
  // The two sentences the server sends for a 409 on register.
  it('recognises the real-name conflict', () => {
    expect(isRealNameTakenMessage('A player with that real name is already registered. Sign in instead.')).toBe(true);
  });

  it('does not treat the display-name conflict as one', () => {
    expect(isRealNameTakenMessage('That display name is already taken. Pick a different one.')).toBe(false);
  });
});

describe('describeRateLimit', () => {
  it.each([
    [30, 'Too many attempts. Try again in 30 seconds'],
    [1, 'Too many attempts. Try again in 1 second'],
    [undefined, 'Too many attempts. Try again in a moment'],
  ])('%s seconds', (seconds, expected) => {
    expect(describeRateLimit(seconds)).toBe(expected);
  });
});

describe('isColourTakenMessage', () => {
  it.each([
    ['Another team already uses that colour.', true],
    ['Another team already uses that color.', true],
    ['A team with that name already exists.', false],
  ])('%s -> %s', (detail, expected) => {
    expect(isColourTakenMessage(detail)).toBe(expected);
  });
});
