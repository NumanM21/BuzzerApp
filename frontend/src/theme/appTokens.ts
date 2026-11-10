import type { ThemePack } from './types';

/**
 * The app's own design tokens, next to Fluent's `tokens`. `ThemeRoot` adds these keys to the Fluent theme object;
 * `FluentProvider` writes every key of that object as a CSS variable (`--appSurfacePage: …`) on its root and on
 * every portal it opens (dialogs, menus), so components can use them anywhere.
 */
export interface AppTokenValues {
  appSurfacePage: string;
  appSurfacePanel: string;
  appSurfacePanelBorder: string;
  appTextBody: string;
  appTextMuted: string;
  appBorderWidth: string;
  appBorderStyle: string;
  appShadow: string;
  appFontHeading: string;
  appFontBody: string;
  appFontNumeric: string;
  appBuzzerRadius: string;
}

/**
 * What components use, e.g. `backgroundColor: appTokens.surfacePanel`. The `satisfies` clause makes the compiler
 * check that every `var(--…)` names a key of `AppTokenValues`, so a typo can't silently produce no style.
 */
export const appTokens = {
  surfacePage: 'var(--appSurfacePage)',
  surfacePanel: 'var(--appSurfacePanel)',
  surfacePanelBorder: 'var(--appSurfacePanelBorder)',
  textBody: 'var(--appTextBody)',
  textMuted: 'var(--appTextMuted)',
  borderWidth: 'var(--appBorderWidth)',
  borderStyle: 'var(--appBorderStyle)',
  shadow: 'var(--appShadow)',
  fontHeading: 'var(--appFontHeading)',
  fontBody: 'var(--appFontBody)',
  fontNumeric: 'var(--appFontNumeric)',
  buzzerRadius: 'var(--appBuzzerRadius)',
} as const satisfies Record<string, `var(--${keyof AppTokenValues})`>;

export function appTokenValues(pack: ThemePack): AppTokenValues {
  return {
    appSurfacePage: pack.surfaces.page,
    appSurfacePanel: pack.surfaces.panel,
    appSurfacePanelBorder: pack.surfaces.panelBorder,
    appTextBody: pack.text.body,
    appTextMuted: pack.text.muted,
    appBorderWidth: pack.border.width,
    appBorderStyle: pack.border.style,
    appShadow: pack.shadow,
    appFontHeading: pack.fonts.heading,
    appFontBody: pack.fonts.body,
    appFontNumeric: pack.fonts.numeric,
    appBuzzerRadius: pack.buzzer.radius,
  };
}
