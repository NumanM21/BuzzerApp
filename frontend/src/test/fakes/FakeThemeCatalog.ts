import type { PackKeys, ThemeCatalog } from '@/domain/themeCatalog';

/**
 * An in-memory theme catalog. By default `loadKeys` answers at once; with `manual: true` each call waits until the
 * test calls `resolve(themeKey)`, so a test can control the order responses arrive in.
 */
export class FakeThemeCatalog implements ThemeCatalog {
  readonly themeKeys: readonly string[];
  readonly loadCalls: string[] = [];

  private readonly packs: Record<string, PackKeys>;
  private readonly manual: boolean;
  private readonly waiting: { themeKey: string; resolve: (keys: PackKeys) => void }[] = [];

  constructor(packs: Record<string, PackKeys>, { manual = false }: { manual?: boolean } = {}) {
    this.packs = packs;
    this.themeKeys = Object.keys(packs);
    this.manual = manual;
  }

  loadKeys(themeKey: string): Promise<PackKeys> {
    this.loadCalls.push(themeKey);
    const keys = this.packs[themeKey];
    if (!keys) {
      return Promise.reject(new Error(`No pack "${themeKey}".`));
    }
    if (!this.manual) {
      return Promise.resolve(keys);
    }
    return new Promise((resolve) => this.waiting.push({ themeKey, resolve }));
  }

  /** Answers the oldest waiting call for `themeKey`. */
  resolve(themeKey: string): void {
    const index = this.waiting.findIndex((call) => call.themeKey === themeKey);
    if (index < 0) {
      throw new Error(`No waiting call for "${themeKey}".`);
    }
    const [call] = this.waiting.splice(index, 1);
    call.resolve(this.packs[themeKey]);
  }
}

/** Pack keys with `colorCount` colours and `iconCount` icons, named neutrally. */
export function makePackKeys(colorCount: number, iconCount: number): PackKeys {
  return {
    colorKeys: Array.from({ length: colorCount }, (_, index) => `color-${index + 1}`),
    iconKeys: Array.from({ length: iconCount }, (_, index) => `icon-${index + 1}`),
  };
}
