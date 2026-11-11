import { describe, expect, it } from 'vitest';
import { connectionNoticeFor } from './connectionNotice';

describe('connectionNoticeFor', () => {
  it('says nothing while connected', () => {
    expect(connectionNoticeFor('connected')).toBeUndefined();
  });

  it.each([
    ['connecting', 'Connecting to the game…'],
    ['reconnecting', 'Connection lost. Reconnecting…'],
    ['disconnected', 'Not connected to the game'],
  ] as const)('puts %s in words', (state, text) => {
    expect(connectionNoticeFor(state)).toBe(text);
  });
});
