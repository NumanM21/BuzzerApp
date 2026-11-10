import { createBrowserRouter, type DataRouter, type RouteObject } from 'react-router';
import { HomePage } from '@/features/home/HomePage';

// Route paths never contain a dot: the server treats a path whose last segment has a dot as a file, not a page.
export function createAppRoutes(): RouteObject[] {
  const routes: RouteObject[] = [{ path: '/', Component: HomePage }];

  // A production build replaces `import.meta.env.DEV` with `false` and drops this branch, preview page and all.
  if (import.meta.env.DEV) {
    routes.push({
      path: '/dev/theme',
      lazy: async () => ({ Component: (await import('@/features/dev/ThemePreviewPage')).ThemePreviewPage }),
    });
  }

  return routes;
}

export function createAppRouter(): DataRouter {
  return createBrowserRouter(createAppRoutes());
}
