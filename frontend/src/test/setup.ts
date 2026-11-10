import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi, type MockInstance } from 'vitest';
import { configureMobx } from '@/mvvm/configureMobx';
import { server } from './msw/server';

configureMobx();

// jsdom has no matchMedia; Fluent asks it about reduced motion. Nothing here prefers anything.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom has no ResizeObserver either; Fluent uses it to reflow some controls (MessageBar). jsdom has no layout, so
// nothing would ever be observed to resize anyway.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// The fake network (MSW, in Node). A request no handler describes fails the test rather than reaching the real
// network; each test starts from the default handlers again, whatever it overrode with `server.use`.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

// MobX only warns when state changes outside an action (a forgotten runInAction after an await). A warning is easy
// to miss in test output, so any MobX warning fails the test that caused it.
let consoleWarn: MockInstance<typeof console.warn>;

beforeEach(() => {
  consoleWarn = vi.spyOn(console, 'warn');
});

afterEach(() => {
  // With explicit vitest imports (no globals), Testing Library can't register its own cleanup.
  cleanup();
  server.resetHandlers();
  const mobxWarnings = consoleWarn.mock.calls.filter(([message]) => String(message).startsWith('[MobX]'));
  consoleWarn.mockRestore();
  if (mobxWarnings.length > 0) {
    throw new Error(`MobX warned during this test:\n${mobxWarnings.map(([message]) => String(message)).join('\n')}`);
  }
});
