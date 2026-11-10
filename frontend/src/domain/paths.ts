// Every route of the app in one place: the router, the navigation and the guards' redirects all use these, so a path
// is never typed twice. A path never contains a dot (the server takes a last segment with a dot for a file).
export const appPaths = {
  join: '/join',
  play: '/play',
  teams: '/teams',
  scores: '/scores',
  adminHost: '/admin',
  adminScores: '/admin/scores',
  adminEvent: '/admin/event',
} as const;
