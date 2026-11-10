import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor } from './contrast';

describe('parseColor', () => {
  it.each([
    ['#fff', { r: 255, g: 255, b: 255 }],
    ['#0F6CBD', { r: 15, g: 108, b: 189 }],
    ['rgb(12 34 56)', { r: 12, g: 34, b: 56 }],
    ['rgb(12, 34, 56)', { r: 12, g: 34, b: 56 }],
    ['hsl(0 100% 50%)', { r: 255, g: 0, b: 0 }],
    ['hsl(120deg, 100%, 25%)', { r: 0, g: 128, b: 0 }],
    ['hsl(0 0% 100%)', { r: 255, g: 255, b: 255 }],
  ])('reads %s', (text, expected) => {
    expect(parseColor(text)).toEqual(expected);
  });

  it.each(['red', '#ffff', '#12345', '#ff000080', 'rgb(0 0 0 / 50%)', 'rgb(300 0 0)', 'transparent', ''])(
    'rejects %s',
    (text) => {
      expect(parseColor(text)).toBeUndefined();
    },
  );
});

describe('contrastRatio', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  it('is 21 for black on white, in either order', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
  });

  it('is 1 for a colour on itself', () => {
    expect(contrastRatio(white, white)).toBe(1);
  });

  it('matches the WCAG value for mid grey on white', () => {
    // #767676 is the classic lightest grey that passes 4.5:1 on white.
    expect(contrastRatio({ r: 0x76, g: 0x76, b: 0x76 }, white)).toBeCloseTo(4.54, 2);
  });
});
