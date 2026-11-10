import { createDarkTheme, createLightTheme, type Theme } from '@fluentui/react-components';
import { appTokenValues, type AppTokenValues } from './appTokens';
import type { ThemePack } from './types';

export type AppTheme = Theme & AppTokenValues;

/**
 * One object for `FluentProvider`: Fluent's theme from the pack's brand ramp, the pack's fonts for Fluent's own
 * controls, the pack's overrides, then the app tokens as extra keys (see `appTokens.ts` for why that works).
 */
export function buildFluentTheme(pack: ThemePack): AppTheme {
  const base = pack.fluent.mode === 'dark' ? createDarkTheme(pack.fluent.brand) : createLightTheme(pack.fluent.brand);
  return {
    ...base,
    fontFamilyBase: pack.fonts.body,
    fontFamilyNumeric: pack.fonts.numeric,
    ...pack.fluent.overrides,
    ...appTokenValues(pack),
  };
}
