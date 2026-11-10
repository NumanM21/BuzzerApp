import type { PackKeys, ThemeCatalog } from '@/domain/themeCatalog';
import type { ThemePack } from './types';

export const DEFAULT_THEME_KEY = 'default';

/**
 * Every registered pack, by the key the server's event names. Each is a lazy `import()`, so a phone only downloads
 * the pack (and its fonts and icons) the event uses. Packs are never removed: archives refer to them by key.
 * The order here is the order the preview page lists them in.
 */
const loaders: Record<string, () => Promise<{ default: ThemePack }>> = {
  [DEFAULT_THEME_KEY]: () => import('./packs/default'),
};

export const themeKeys: readonly string[] = Object.keys(loaders);

/** An unknown key (an old archive, a typo in the server config) gets the default pack instead of an error. */
export function resolveThemeKey(themeKey: string): string {
  return Object.hasOwn(loaders, themeKey) ? themeKey : DEFAULT_THEME_KEY;
}

// One promise per key, so every caller (and React's `use`, which needs the same promise on every render) shares it.
const cache = new Map<string, Promise<ThemePack>>();

export function loadThemePack(themeKey: string): Promise<ThemePack> {
  const key = resolveThemeKey(themeKey);
  let pack = cache.get(key);
  if (!pack) {
    pack = loaders[key]().then((module) => module.default);
    // A failed download (a flaky phone connection) must not be remembered, or the pack could never load again.
    pack.catch(() => cache.delete(key));
    cache.set(key, pack);
  }
  return pack;
}

export function packKeysOf(pack: ThemePack): PackKeys {
  return {
    colorKeys: Object.keys(pack.teams.colors),
    iconKeys: Object.keys(pack.teams.icons),
  };
}

/** The registry as view models see it: keys only, never a look. `createAppServices` hands it out. */
export const themeCatalog: ThemeCatalog = {
  themeKeys,
  loadKeys: async (themeKey) => packKeysOf(await loadThemePack(themeKey)),
};
