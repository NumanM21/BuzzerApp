import { describe, expect, it } from 'vitest';
import { buzzerVisualStates } from '@/domain/buzzer';
import { contrastRatio, parseColor } from './contrast';
import { defaultCopy } from './defaultCopy';
import { loadThemePack, themeKeys } from './registry';
import type { TeamColor, ThemePack } from './types';

// Runs over every registered pack, so a new pack is checked by `npm test` without anyone writing a test for it.

const MIN_CONTRAST = 4.5;
// The server's rule for colour and icon keys; a pack key the server can't store could never be picked.
const KEY_PATTERN = /^[a-z0-9-]{1,50}$/;
const BRAND_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160] as const;

// Every image file inside the packs, by the path an import of it resolves to in tests.
const packAssets = new Set(Object.keys(import.meta.glob('/src/theme/packs/**/*.{png,svg,jpg,jpeg,webp,gif,avif}')));

const packs = await Promise.all(themeKeys.map(async (key) => [key, await loadThemePack(key)] as const));

function contrast(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) {
    throw new Error(`Not a colour the contract accepts: "${!fg ? foreground : background}"`);
  }
  return contrastRatio(fg, bg);
}

/** Every colour slot with a readable name, for "every colour parses". */
function colorSlots(pack: ThemePack): [string, string][] {
  const slots: [string, string][] = [
    ['surfaces.page', pack.surfaces.page],
    ['surfaces.panel', pack.surfaces.panel],
    ['surfaces.panelBorder', pack.surfaces.panelBorder],
    ['text.body', pack.text.body],
    ['text.muted', pack.text.muted],
    ['teams.fallback.color.fill', pack.teams.fallback.color.fill],
    ['teams.fallback.color.onFill', pack.teams.fallback.color.onFill],
    ...BRAND_STEPS.map((step): [string, string] => [`fluent.brand.${step}`, pack.fluent.brand[step]]),
  ];
  for (const [key, color] of Object.entries(pack.teams.colors)) {
    slots.push([`teams.colors.${key}.fill`, color.fill], [`teams.colors.${key}.onFill`, color.onFill]);
  }
  for (const state of buzzerVisualStates) {
    const colors = pack.buzzer.states[state]?.colors;
    if (colors && colors !== 'team') {
      slots.push([`buzzer.states.${state}.fill`, colors.fill], [`buzzer.states.${state}.text`, colors.text]);
    }
  }
  if (pack.effects?.scanlines) {
    slots.push(['effects.scanlines.color', pack.effects.scanlines.color]);
  }
  return slots;
}

function teamColors(pack: ThemePack): [string, TeamColor][] {
  return [...Object.entries(pack.teams.colors), ['(fallback)', pack.teams.fallback.color]];
}

function iconResolves(url: string): boolean {
  if (url.startsWith('data:image/')) {
    return true;
  }
  return packAssets.has(url.split('?')[0]);
}

it('registers at least the default pack', () => {
  expect(themeKeys).toContain('default');
});

describe.each(packs)('theme pack "%s"', (registryKey, pack) => {
  it('is registered under its own key', () => {
    expect(pack.key).toBe(registryKey);
  });

  it('fills every text slot', () => {
    const slots = {
      'border.width': pack.border.width,
      shadow: pack.shadow,
      'fonts.heading': pack.fonts.heading,
      'fonts.body': pack.fonts.body,
      'fonts.numeric': pack.fonts.numeric,
      'buzzer.radius': pack.buzzer.radius,
    };
    for (const [slot, value] of Object.entries(slots)) {
      expect(value.trim(), slot).not.toBe('');
    }
  });

  it('writes every colour as an opaque hex, rgb() or hsl() colour', () => {
    for (const [slot, value] of colorSlots(pack)) {
      expect(parseColor(value), `${slot} = "${value}"`).toBeDefined();
    }
  });

  it('keeps body and muted text readable on the page and on panels', () => {
    for (const [textSlot, text] of Object.entries(pack.text)) {
      for (const [surfaceSlot, surface] of [
        ['page', pack.surfaces.page],
        ['panel', pack.surfaces.panel],
      ]) {
        expect(contrast(text, surface), `text.${textSlot} on surfaces.${surfaceSlot}`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    }
  });

  it('has at least one team colour and one icon, under keys the server accepts', () => {
    expect(Object.keys(pack.teams.colors).length).toBeGreaterThan(0);
    expect(Object.keys(pack.teams.icons).length).toBeGreaterThan(0);
    for (const key of [...Object.keys(pack.teams.colors), ...Object.keys(pack.teams.icons)]) {
      expect(key, `key "${key}"`).toMatch(KEY_PATTERN);
    }
  });

  it('gives every team colour (and the fallback) a readable text colour', () => {
    for (const [key, color] of teamColors(pack)) {
      expect(contrast(color.onFill, color.fill), `teams.colors.${key}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('has a fallback colour and icon', () => {
    expect(pack.teams.fallback.color).toBeDefined();
    expect(pack.teams.fallback.icon).toBeTruthy();
  });

  it('points every icon (and the fallback) at an image that exists', () => {
    for (const [key, url] of [...Object.entries(pack.teams.icons), ['(fallback)', pack.teams.fallback.icon]]) {
      expect(iconResolves(url), `teams.icons.${key} = ${url.slice(0, 80)}`).toBe(true);
    }
  });

  it('defines every buzzer state, readable where it has fixed colours', () => {
    expect(Object.keys(pack.buzzer.states).sort()).toEqual([...buzzerVisualStates].sort());
    for (const state of buzzerVisualStates) {
      const look = pack.buzzer.states[state];
      expect(['none', 'pulse', 'blink'], `buzzer.states.${state}.animation`).toContain(look.animation);
      if (look.colors !== 'team') {
        expect(contrast(look.colors.text, look.colors.fill), `buzzer.states.${state}`).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      }
    }
  });

  it('pads scores to a sensible number of digits', () => {
    expect(Number.isInteger(pack.numbers.scoreDigits)).toBe(true);
    expect(pack.numbers.scoreDigits).toBeGreaterThanOrEqual(0);
    expect(pack.numbers.scoreDigits).toBeLessThanOrEqual(10);
  });

  it('only flavours known copy keys, with real text', () => {
    for (const [key, text] of Object.entries(pack.copy ?? {})) {
      expect(Object.keys(defaultCopy), `copy.${key}`).toContain(key);
      expect(text.trim(), `copy.${key}`).not.toBe('');
    }
  });
});
