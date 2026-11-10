/**
 * What a theme pack offers as data: the team colour and icon keys it can draw. View models may know these keys
 * (to build sample data, or to offer the spare keys when an admin creates a team) but never how a key looks.
 */
export interface PackKeys {
  colorKeys: readonly string[];
  iconKeys: readonly string[];
}

/** The registered theme packs, as view models see them. `theme/registry.ts` implements it. */
export interface ThemeCatalog {
  readonly themeKeys: readonly string[];
  loadKeys(themeKey: string): Promise<PackKeys>;
}
