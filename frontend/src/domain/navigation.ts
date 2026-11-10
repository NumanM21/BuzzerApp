import { appPaths } from './paths';
import type { Role } from './routeAccess';

export type NavItemKey = 'buzz' | 'host' | 'teams' | 'scores' | 'event';

/** One entry of the bottom navigation. The view picks an icon from `key`; the label is always shown as text. */
export interface NavItem {
  key: NavItemKey;
  label: string;
  path: string;
}

const playerNav: readonly NavItem[] = [
  { key: 'buzz', label: 'Buzz', path: appPaths.play },
  { key: 'teams', label: 'Teams', path: appPaths.teams },
  { key: 'scores', label: 'Scores', path: appPaths.scores },
];

// An admin's Scores entry is the scoring screen, which is also where they see the standings they adjust.
const adminNav: readonly NavItem[] = [
  { key: 'host', label: 'Host', path: appPaths.adminHost },
  { key: 'teams', label: 'Teams', path: appPaths.teams },
  { key: 'scores', label: 'Scores', path: appPaths.adminScores },
  { key: 'event', label: 'Event', path: appPaths.adminEvent },
];

export function navItemsFor(role: Role): readonly NavItem[] {
  return role === 'admin' ? adminNav : playerNav;
}
