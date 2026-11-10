import { describe, expect, it } from 'vitest';

// Colours, fonts, corner radii and shadows are the pack's job (PlanMVP D31). Outside `theme/packs/`, components use
// Fluent `tokens` or `appTokens`. This test reads the source and fails on the ways a hard-coded style usually gets
// written. The patterns are deliberately simple; each says what it catches.

const rules: { name: string; pattern: RegExp }[] = [
  // `#f00`, `#ff0000`, `#ff000080`: a hex colour anywhere in code.
  { name: 'hex colour', pattern: /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i },
  // `rgb(`, `rgba(`, `hsl(`, `oklch(` and the other CSS colour functions.
  { name: 'colour function', pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i },
  // `color: 'red'` on a colour property. Keywords that aren't a colour choice (transparent, inherit…) are fine.
  {
    name: 'named colour',
    pattern:
      /\b(?:color|backgroundColor|background|borderColor|outlineColor|fill|stroke)\s*:\s*['"`](?!(?:transparent|currentColor|inherit|none)['"`])[a-z]+['"`]/i,
  },
  // `fontFamily: 'Arial'`: a literal font. Use `appTokens.font…` or Fluent's `tokens.fontFamily…`.
  { name: 'literal font family', pattern: /\bfontFamily\s*:\s*['"`]/ },
  // `borderRadius: 4`, `borderRadius: '4px'`, `shorthands.borderRadius('4px')`. Use `tokens.borderRadius…`.
  { name: 'numeric border radius', pattern: /\bborderRadius\s*(?::|\()\s*['"`]?\d/ },
  // `boxShadow: '0 2px 4px …'`. Use `appTokens.shadow` or `tokens.shadow…`; `'none'` is allowed.
  { name: 'literal box shadow', pattern: /\bboxShadow\s*:\s*['"`](?!none['"`])/ },
];

// Comments may talk about colours ("the classic #767676 grey"); blank them out, keeping line numbers. A `//` inside
// a string (a URL) also blanks the rest of that line, which can only hide a finding, never invent one.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, (comment) => comment.replace(/[^\n]/g, ' '));
}

function findHardcodedStyles(source: string): string[] {
  const findings: string[] = [];
  withoutComments(source)
    .split('\n')
    .forEach((line, index) => {
      for (const rule of rules) {
        const match = rule.pattern.exec(line);
        if (match) {
          findings.push(`line ${index + 1}: ${rule.name} "${match[0]}"`);
        }
      }
    });
  return findings;
}

// Every source file except the packs (where style belongs), tests and test support.
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
const checkedFiles = Object.entries(sources).filter(
  ([path]) => !path.startsWith('/src/theme/packs/') && !path.startsWith('/src/test/') && !/\.test\.tsx?$/.test(path),
);

describe('no hard-coded style outside theme/packs', () => {
  it('finds source files to check', () => {
    expect(checkedFiles.length).toBeGreaterThan(10);
  });

  it.each(checkedFiles.map(([path, source]) => [path, source] as const))('%s', (_path, source) => {
    expect(findHardcodedStyles(source)).toEqual([]);
  });
});

describe('the patterns', () => {
  it.each([
    "color: '#ff0000',",
    "backgroundColor: '#FFF',",
    "border: '1px solid #12345678',",
    "color: 'rgb(255, 0, 0)',",
    "backgroundColor: 'hsl(0 100% 50%)',",
    "color: 'red',",
    "backgroundColor: 'white',",
    "fontFamily: 'Arial, sans-serif',",
    'fontFamily: `Press Start`,',
    'borderRadius: 4,',
    "borderRadius: '8px',",
    "...shorthands.borderRadius('4px'),",
    "boxShadow: '0 2px 4px black',",
  ])('catches %s', (line) => {
    expect(findHardcodedStyles(line)).not.toEqual([]);
  });

  it.each([
    'color: tokens.colorNeutralForeground1,',
    'backgroundColor: appTokens.surfacePanel,',
    "backgroundColor: 'var(--team-fill)',",
    "WebkitTapHighlightColor: 'transparent',",
    "color: 'inherit',",
    'fontFamily: appTokens.fontBody,',
    'borderRadius: tokens.borderRadiusMedium,',
    'boxShadow: appTokens.shadow,',
    "boxShadow: 'none',",
    '// the classic #767676 grey',
    "<Badge color='brand' />",
    "const container = document.getElementById('root');",
  ])('allows %s', (line) => {
    expect(findHardcodedStyles(line)).toEqual([]);
  });
});
