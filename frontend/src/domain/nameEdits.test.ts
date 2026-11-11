import { describe, expect, it } from 'vitest';
import { changedNames } from './nameEdits';

const original = { displayName: 'Player 1', realName: 'Real Name 1' };

describe('changedNames', () => {
  it('is empty when nothing changed', () => {
    expect(changedNames(original, { displayName: 'Player 1', realName: 'Real Name 1' })).toEqual({});
  });

  it('ignores surrounding spaces', () => {
    expect(changedNames(original, { displayName: ' Player 1 ', realName: 'Real Name 1  ' })).toEqual({});
  });

  it('sends only the display name when only it changed, trimmed', () => {
    expect(changedNames(original, { displayName: '  Ace ', realName: 'Real Name 1' })).toEqual({ displayName: 'Ace' });
  });

  it('sends only the real name when only it changed', () => {
    expect(changedNames(original, { displayName: 'Player 1', realName: 'Someone Else' })).toEqual({
      realName: 'Someone Else',
    });
  });

  it('counts a change of letter case', () => {
    expect(changedNames(original, { displayName: 'player 1', realName: 'Real Name 1' })).toEqual({
      displayName: 'player 1',
    });
  });

  it('sends both when both changed', () => {
    expect(changedNames(original, { displayName: 'A1', realName: 'B2' })).toEqual({ displayName: 'A1', realName: 'B2' });
  });

  it('treats an unknown real name as empty, so leaving it empty is no change', () => {
    expect(changedNames({ displayName: 'P', realName: null }, { displayName: 'P', realName: '' })).toEqual({});
  });
});
