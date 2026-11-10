import { describe, expect, it } from 'vitest';
import { appPaths } from './paths';
import { decideRoute, startPathFor, type RouteAccess, type SessionView } from './routeAccess';

const unknown: SessionView = { status: 'unknown', role: undefined };
const anonymous: SessionView = { status: 'anonymous', role: undefined };
const player: SessionView = { status: 'signedIn', role: 'player' };
const admin: SessionView = { status: 'signedIn', role: 'admin' };

const allow = { kind: 'allow' };
const wait = { kind: 'wait' };
const redirect = (to: string) => ({ kind: 'redirect', to });

describe('startPathFor', () => {
  it.each([
    [undefined, appPaths.join],
    ['player' as const, appPaths.play],
    ['admin' as const, appPaths.adminHost],
  ])('sends role %s to %s', (role, path) => {
    expect(startPathFor(role)).toBe(path);
  });
});

describe('decideRoute', () => {
  const accesses: RouteAccess[] = ['anonymousOnly', 'signedIn', 'player', 'admin', 'start'];

  it.each(accesses)('waits on %s while the session is unknown, so nothing is ever flashed', (access) => {
    expect(decideRoute(access, unknown)).toEqual(wait);
  });

  it.each([
    ['anonymousOnly', allow],
    ['signedIn', redirect(appPaths.join)],
    ['player', redirect(appPaths.join)],
    ['admin', redirect(appPaths.join)],
    ['start', redirect(appPaths.join)],
  ] as const)('anonymous on %s', (access, expected) => {
    expect(decideRoute(access, anonymous)).toEqual(expected);
  });

  it.each([
    ['anonymousOnly', redirect(appPaths.play)],
    ['signedIn', allow],
    ['player', allow],
    ['admin', redirect(appPaths.play)],
    ['start', redirect(appPaths.play)],
  ] as const)('a player on %s', (access, expected) => {
    expect(decideRoute(access, player)).toEqual(expected);
  });

  it.each([
    ['anonymousOnly', redirect(appPaths.adminHost)],
    ['signedIn', allow],
    ['player', redirect(appPaths.adminHost)],
    ['admin', allow],
    ['start', redirect(appPaths.adminHost)],
  ] as const)('an admin on %s', (access, expected) => {
    expect(decideRoute(access, admin)).toEqual(expected);
  });

  it('treats a signed-in session without a role as anonymous rather than letting it through', () => {
    expect(decideRoute('admin', { status: 'signedIn', role: undefined })).toEqual(redirect(appPaths.join));
  });
});
