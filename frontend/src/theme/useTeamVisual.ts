import type { ThemePack } from './types';
import { useThemePack } from './useThemePack';

export interface TeamVisual {
  fill: string;
  /** Text colour that is readable on `fill`. */
  onFill: string;
  iconUrl: string;
}

/**
 * How a team looks in the active pack. A key the pack doesn't know (a team created under another year's pack, a
 * config typo) gets the pack's fallback colour or icon, never an error: each key falls back on its own.
 */
export function useTeamVisual(colorKey: string, iconKey: string): TeamVisual {
  return resolveTeamVisual(useThemePack(), colorKey, iconKey);
}

export function resolveTeamVisual(pack: ThemePack, colorKey: string, iconKey: string): TeamVisual {
  const { colors, icons, fallback } = pack.teams;
  // hasOwn, not `colors[key] ?? …`, so a key such as "constructor" can't pick up something from Object.prototype.
  const color = Object.hasOwn(colors, colorKey) ? colors[colorKey] : fallback.color;
  const iconUrl = Object.hasOwn(icons, iconKey) ? icons[iconKey] : fallback.icon;
  return { fill: color.fill, onFill: color.onFill, iconUrl };
}
