import { describe, expect, it } from 'vitest';
import defaultPack from './packs/default';
import type { ThemePack } from './types';
import { resolveTeamVisual } from './useTeamVisual';

// A pack with exactly one known colour and icon, built from the default pack so the test doesn't depend on its keys.
const pack: ThemePack = {
  ...defaultPack,
  teams: {
    colors: { known: { fill: '#000000', onFill: '#ffffff' } },
    icons: { known: 'known.png' },
    fallback: { color: { fill: '#ffffff', onFill: '#000000' }, icon: 'fallback.png' },
  },
};

describe('resolveTeamVisual', () => {
  it('uses the pack colour and icon for known keys', () => {
    expect(resolveTeamVisual(pack, 'known', 'known')).toEqual({
      fill: '#000000',
      onFill: '#ffffff',
      iconUrl: 'known.png',
    });
  });

  it('falls back for unknown keys', () => {
    expect(resolveTeamVisual(pack, 'missing', 'missing')).toEqual({
      fill: '#ffffff',
      onFill: '#000000',
      iconUrl: 'fallback.png',
    });
  });

  it('falls back for colour and icon independently', () => {
    expect(resolveTeamVisual(pack, 'known', 'missing')).toMatchObject({ fill: '#000000', iconUrl: 'fallback.png' });
    expect(resolveTeamVisual(pack, 'missing', 'known')).toMatchObject({ fill: '#ffffff', iconUrl: 'known.png' });
  });

  it.each(['constructor', 'toString', '__proto__', ''])('treats "%s" as unknown', (key) => {
    expect(resolveTeamVisual(pack, key, key).iconUrl).toBe('fallback.png');
  });
});
