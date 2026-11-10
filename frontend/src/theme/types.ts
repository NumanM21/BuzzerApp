import type { BrandVariants, Theme } from '@fluentui/react-components';
import type { BuzzerVisualState } from '@/domain/buzzer';
import type { CopyKey } from './defaultCopy';

/**
 * A theme pack: the whole visual identity of one year's event, as **data only**. No components, JSX or functions,
 * which is what lets next year's design be turned into a pack by filling in this one typed object (by hand or by an
 * AI) and lets `packs.contract.test.ts` check it.
 *
 * Every colour is a CSS colour written as hex (`#1a2b3c`), `rgb()` or `hsl()`, without transparency, so the
 * contract test can check contrast.
 */
export interface ThemePack {
  /** The registry key, also the event's `ThemeKey` on the server (for example `default`, `arcade-2026`). */
  key: string;

  /** Fluent UI's own theme: light or dark, built from a 16-step brand colour ramp, plus any token overrides. */
  fluent: {
    mode: 'light' | 'dark';
    brand: BrandVariants;
    /** Fluent tokens to replace, for example every `borderRadius*` set to `0` for square corners. */
    overrides?: Partial<Theme>;
  };

  /** Backgrounds of the app's own areas (Fluent controls keep Fluent's backgrounds). */
  surfaces: {
    page: string;
    panel: string;
    panelBorder: string;
  };

  /** Text on `page` and `panel`. Both must reach 4.5:1 contrast on both surfaces. */
  text: {
    body: string;
    /** Secondary text, such as a real name under a display name. */
    muted: string;
  };

  /** The frame drawn around panels and team cards (the team card's border takes the team's colour). */
  border: {
    width: string;
    style: 'solid' | 'dashed' | 'dotted' | 'double';
  };

  /** The panel shadow, a full CSS `box-shadow` value (`none` for flat). */
  shadow: string;

  /** CSS font stacks. A pack that uses web fonts imports them in its own folder so they load with the pack. */
  fonts: {
    heading: string;
    body: string;
    /** Scores and other numbers. */
    numeric: string;
  };

  buzzer: {
    /** The buzzer's corner radius: `50%` for a round button. */
    radius: string;
    states: Record<BuzzerVisualState, BuzzerLook>;
  };

  teams: {
    /** colorKey → colours. May hold more keys than the seeded teams use: the spares are offered for new teams. */
    colors: Record<string, TeamColor>;
    /** iconKey → image URL (import the file so the build fingerprints it). Spares allowed, as for colours. */
    icons: Record<string, string>;
    /** Used for a colour or icon key this pack doesn't know, such as a key from another year's pack. */
    fallback: { color: TeamColor; icon: string };
  };

  numbers: {
    /** Scores are zero-padded to this many digits (`5` shows 120 as `00120`); `0` means no padding. */
    scoreDigits: number;
  };

  effects?: {
    /** Faint horizontal lines over the whole page, drawn in this colour (use one close to the page colour). */
    scanlines?: { color: string };
  };

  /** Flavour text that replaces the neutral wording in `defaultCopy.ts`, key by key. */
  copy?: Partial<Record<CopyKey, string>>;
}

export interface TeamColor {
  fill: string;
  /** Text drawn on `fill`; must reach 4.5:1 contrast on it. */
  onFill: string;
}

export type BuzzerAnimation = 'none' | 'pulse' | 'blink';

export interface BuzzerLook {
  /**
   * `'team'` paints the buzzer in the player's own team colour (`fill` with `onFill` text); otherwise fixed colours.
   * States must also differ by their label and animation, never by colour alone.
   */
  colors: 'team' | { fill: string; text: string };
  animation: BuzzerAnimation;
}
