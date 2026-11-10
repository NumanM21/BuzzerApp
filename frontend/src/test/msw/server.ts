import { setupServer } from 'msw/node';
import { defaultHandlers } from './handlers';

/**
 * The fake network for every test. `setup.ts` starts it with `onUnhandledFrame: 'error'`, so a test that reaches
 * for a route nobody described fails instead of silently going out to the real network.
 */
export const server = setupServer(...defaultHandlers);
