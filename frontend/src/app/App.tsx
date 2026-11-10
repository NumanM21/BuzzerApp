import type { DataRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { DEFAULT_THEME_KEY } from '@/theme/registry';
import { ThemeRoot } from '@/theme/ThemeRoot';
import type { AppServices } from './AppServices';
import { AppServicesProvider } from './AppServicesProvider';

interface AppProps {
  services: AppServices;
  router: DataRouter;
}

export function App({ services, router }: AppProps) {
  return (
    <AppServicesProvider services={services}>
      {/* F2 passes the active event's theme key here. */}
      <ThemeRoot themeKey={DEFAULT_THEME_KEY}>
        <RouterProvider router={router} />
      </ThemeRoot>
    </AppServicesProvider>
  );
}
