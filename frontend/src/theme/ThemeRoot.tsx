import { FluentProvider, makeStaticStyles, makeStyles, mergeClasses } from '@fluentui/react-components';
import { Suspense, use, useEffect, useMemo, type ReactNode } from 'react';
import { appTokens } from './appTokens';
import { buildFluentTheme } from './buildFluentTheme';
import { mergeCopy } from './defaultCopy';
import { loadThemePack } from './registry';
import { ThemePackContext, type LoadedTheme } from './ThemePackContext';
import type { ThemePack } from './types';

/**
 * `page` is the app's root: it fills the screen and paints the document behind it (the area a phone shows when you
 * over-scroll, scroll bars, native form controls). `section` themes only its own box, for a preview inside a page.
 */
export type ThemeScope = 'page' | 'section';

interface ThemeRootProps {
  /** The event's theme key; an unknown key gets the default pack. */
  themeKey: string;
  scope?: ThemeScope;
  children: ReactNode;
}

/** Loads the pack for `themeKey` and themes everything inside it. Shows a plain splash while the pack downloads. */
export function ThemeRoot({ themeKey, scope = 'page', children }: ThemeRootProps) {
  return (
    <Suspense fallback={<ThemeSplash />}>
      <LoadThemePack themeKey={themeKey} scope={scope}>
        {children}
      </LoadThemePack>
    </Suspense>
  );
}

function LoadThemePack({ themeKey, scope, children }: Required<ThemeRootProps>) {
  // `use` suspends until the pack's promise settles; the registry hands out the same promise for the same key.
  const pack = use(loadThemePack(themeKey));
  return (
    <ThemePackProvider pack={pack} scope={scope}>
      {children}
    </ThemePackProvider>
  );
}

// Unstyled on purpose: no pack is loaded yet, so there is nothing to style it with.
export function ThemeSplash() {
  return <div role="status">Loading…</div>;
}

const useGlobalStyles = makeStaticStyles({
  body: { margin: 0 },
});

const useStyles = makeStyles({
  root: {
    position: 'relative',
    backgroundColor: appTokens.surfacePage,
    color: appTokens.textBody,
    fontFamily: appTokens.fontBody,
  },
  page: {
    minHeight: '100dvh',
  },
  scanlines: {
    position: 'fixed',
    inset: 0,
    zIndex: 1,
    pointerEvents: 'none',
    backgroundImage:
      'repeating-linear-gradient(to bottom, transparent 0, transparent 2px, var(--scanline-color) 2px, var(--scanline-color) 3px)',
  },
  // Inside a section the lines cover that section only, not the whole screen.
  scanlinesInSection: {
    position: 'absolute',
  },
});

interface ThemePackProviderProps {
  pack: ThemePack;
  scope?: ThemeScope;
  children: ReactNode;
}

/** Themes its children with an already loaded pack. `ThemeRoot` uses it; tests use it directly to skip loading. */
export function ThemePackProvider({ pack, scope = 'page', children }: ThemePackProviderProps) {
  useGlobalStyles();
  const styles = useStyles();
  const theme = useMemo(() => buildFluentTheme(pack), [pack]);
  const loaded = useMemo<LoadedTheme>(() => ({ pack, copy: mergeCopy(pack.copy) }), [pack]);
  const isPage = scope === 'page';

  useEffect(() => {
    if (!isPage) {
      return;
    }
    const root = document.documentElement;
    root.style.colorScheme = pack.fluent.mode;
    root.style.backgroundColor = pack.surfaces.page;
    return () => {
      root.style.colorScheme = '';
      root.style.backgroundColor = '';
    };
  }, [isPage, pack]);

  const scanlines = pack.effects?.scanlines;
  return (
    <ThemePackContext.Provider value={loaded}>
      <FluentProvider theme={theme} className={mergeClasses(styles.root, isPage && styles.page)}>
        {scanlines && (
          <div
            aria-hidden
            className={mergeClasses(styles.scanlines, !isPage && styles.scanlinesInSection)}
            style={{ '--scanline-color': scanlines.color }}
          />
        )}
        {children}
      </FluentProvider>
    </ThemePackContext.Provider>
  );
}
