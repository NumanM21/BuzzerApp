export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
// Space or comma separated, as CSS allows both: `rgb(12 34 56)`, `rgb(12, 34, 56)`.
const rgbPattern = /^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)$/i;
const hslPattern = /^hsl\(\s*(\d{1,3}(?:\.\d+)?)(?:deg)?[\s,]+(\d{1,3}(?:\.\d+)?)%[\s,]+(\d{1,3}(?:\.\d+)?)%\s*\)$/i;

/**
 * Parses an opaque CSS colour written as `#rgb`, `#rrggbb`, `rgb()` or `hsl()`. Anything else (a named colour, a
 * colour with transparency, a typo) gives `undefined`: contrast can't be judged for those, so packs don't use them.
 */
export function parseColor(value: string): Rgb | undefined {
  const text = value.trim();

  const hex = hexPattern.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = rgbPattern.exec(text);
  if (rgb) {
    const [r, g, b] = rgb.slice(1).map(Number);
    return [r, g, b].every((channel) => channel <= 255) ? { r, g, b } : undefined;
  }

  const hsl = hslPattern.exec(text);
  if (hsl) {
    const [hue, saturation, lightness] = hsl.slice(1).map(Number);
    return saturation <= 100 && lightness <= 100 ? hslToRgb(hue % 360, saturation / 100, lightness / 100) : undefined;
  }

  return undefined;
}

// The standard HSL to RGB conversion (CSS Color 4).
function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return { r: channel(0), g: channel(8), b: channel(4) };
}

// WCAG 2 relative luminance.
function luminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio, from 1 (same colour) to 21 (black on white). Normal text needs at least 4.5. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
