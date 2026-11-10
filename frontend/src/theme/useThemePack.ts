import { useCallback, useContext } from 'react';
import type { Copy } from './defaultCopy';
import { formatScore } from './formatScore';
import { ThemePackContext, type LoadedTheme } from './ThemePackContext';
import type { ThemePack } from './types';

function useLoadedTheme(): LoadedTheme {
  const loaded = useContext(ThemePackContext);
  if (!loaded) {
    throw new Error('Theme hooks need a ThemeRoot (or ThemePackProvider) above them.');
  }
  return loaded;
}

/** The active pack, for components that need a raw pack value (for example the buzzer's look per state). */
export function useThemePack(): ThemePack {
  return useLoadedTheme().pack;
}

/** The flavour text of the active pack, with the neutral wording for anything it leaves out. */
export function useCopy(): Copy {
  return useLoadedTheme().copy;
}

/** Formats a score the way the active pack pads numbers. */
export function useFormatScore(): (score: number) => string {
  const digits = useThemePack().numbers.scoreDigits;
  return useCallback((score: number) => formatScore(score, digits), [digits]);
}
