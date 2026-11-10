import { createContext } from 'react';
import type { Copy } from './defaultCopy';
import type { ThemePack } from './types';

export interface LoadedTheme {
  pack: ThemePack;
  /** The pack's copy merged over `defaultCopy`, worked out once per pack. */
  copy: Copy;
}

export const ThemePackContext = createContext<LoadedTheme | undefined>(undefined);
