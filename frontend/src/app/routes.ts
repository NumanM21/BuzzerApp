import { createBrowserRouter, type DataRouter, type RouteObject } from 'react-router';
import { appPaths } from '@/domain/paths';
import { JoinPage } from '@/features/join/JoinPage';
import { PlayPage } from '@/features/play/PlayPage';
import { ScoresPage } from '@/features/scores/ScoresPage';
import { ShellLayout } from '@/features/shell/ShellLayout';
import { TeamsPage } from '@/features/teams/TeamsPage';
import { AdminGuard, AnonymousOnlyGuard, PlayerGuard, SignedInGuard, StartRedirect } from './guards';
import { LazyAdminEventPage, LazyAdminPage, LazyAdminScoresPage } from './lazyAdminPages';

// Route paths never contain a dot: the server treats a path whose last segment has a dot as a file, not a page.
export function createAppRoutes(): RouteObject[] {
  const routes: RouteObject[] = [
    // Public, but only for people who are not signed in: a signed-in person is sent to their own start page.
    { path: appPaths.join, Component: AnonymousOnlyGuard, children: [{ index: true, Component: JoinPage }] },
    {
      // Everything else needs a session. The shell (header and navigation) wraps all of it, so moving between
      // screens keeps the same header instead of rebuilding it; the role guards inside narrow it further.
      Component: SignedInGuard,
      children: [
        {
          Component: ShellLayout,
          children: [
            { path: appPaths.teams, Component: TeamsPage },
            { path: appPaths.scores, Component: ScoresPage },
            { Component: PlayerGuard, children: [{ path: appPaths.play, Component: PlayPage }] },
            {
              Component: AdminGuard,
              children: [
                { path: appPaths.adminHost, Component: LazyAdminPage },
                { path: appPaths.adminScores, Component: LazyAdminScoresPage },
                { path: appPaths.adminEvent, Component: LazyAdminEventPage },
              ],
            },
          ],
        },
      ],
    },
  ];

  // A production build replaces `import.meta.env.DEV` with `false` and drops this branch, preview page and all.
  // It sits outside every guard: it is a developer tool and needs no session.
  if (import.meta.env.DEV) {
    routes.push(
      {
        path: '/dev/theme',
        lazy: async () => ({ Component: (await import('@/features/dev/ThemePreviewPage')).ThemePreviewPage }),
      },
      {
        // The live connection runs only while someone is signed in, so this one needs a session. No shell: it is
        // a debugging view, opened by address.
        Component: SignedInGuard,
        children: [
          {
            path: '/dev/realtime',
            lazy: async () => ({ Component: (await import('@/features/dev/RealtimeDebugPage')).RealtimeDebugPage }),
          },
        ],
      },
    );
  }

  // Last, and matched only when nothing above does: `/` and every address the app doesn't have go to the start page.
  routes.push({ path: '*', Component: StartRedirect });

  return routes;
}

export function createAppRouter(): DataRouter {
  return createBrowserRouter(createAppRoutes());
}
