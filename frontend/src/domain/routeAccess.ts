import { appPaths } from './paths';

export type Role = 'player' | 'admin';

/** `unknown` only until the server has said whether the phone's cookie is still good. */
export type SessionStatus = 'unknown' | 'anonymous' | 'signedIn';

/** What a route needs from the person looking at it. */
export type RouteAccess =
  /** The join screen: only for people who are not signed in. */
  | 'anonymousOnly'
  /** Any signed-in person. */
  | 'signedIn'
  /** Players only: admins don't buzz. */
  | 'player'
  | 'admin'
  /** `/` and unknown paths: nobody stays here, everybody is sent to their start page. */
  | 'start';

export type RouteDecision =
  /** The session isn't known yet: show a splash, never the join page to someone who is signed in. */
  | { kind: 'wait' }
  | { kind: 'allow' }
  | { kind: 'redirect'; to: string };

export interface SessionView {
  status: SessionStatus;
  role: Role | undefined;
}

/** Where a person lands: the join screen when nobody is signed in, else the screen their role works from. */
export function startPathFor(role: Role | undefined): string {
  switch (role) {
    case 'player':
      return appPaths.play;
    case 'admin':
      return appPaths.adminHost;
    default:
      return appPaths.join;
  }
}

/**
 * The guard rules as a pure function, so they are tested without a router. The server stays the authority (it
 * answers 401 and 403 whatever the screen shows); this only keeps people off screens that aren't theirs.
 */
export function decideRoute(access: RouteAccess, session: SessionView): RouteDecision {
  if (session.status === 'unknown') {
    return { kind: 'wait' };
  }

  const { role } = session;
  if (session.status === 'anonymous' || role === undefined) {
    return access === 'anonymousOnly' ? { kind: 'allow' } : { kind: 'redirect', to: appPaths.join };
  }

  const home = { kind: 'redirect', to: startPathFor(role) } as const;
  switch (access) {
    case 'signedIn':
      return { kind: 'allow' };
    case 'player':
      return role === 'player' ? { kind: 'allow' } : home;
    case 'admin':
      return role === 'admin' ? { kind: 'allow' } : home;
    case 'anonymousOnly':
    case 'start':
      return home;
  }
}
