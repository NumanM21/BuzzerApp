import { observer } from 'mobx-react-lite';
import type { DataRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ThemeRoot, ThemeSplash } from '@/theme/ThemeRoot';
import { AppServicesProvider } from './AppServicesProvider';
import type { AppServices } from './AppServices';
import { AppViewModel } from './AppViewModel';
import { AppErrorBoundary } from './errorBoundaries';
import { useViewModel } from './useViewModel';

interface AppProps {
  services: AppServices;
  router: DataRouter;
}

export function App({ services, router }: AppProps) {
  return (
    // Outermost, so it also catches what fails before any route exists: the theme pack not arriving.
    <AppErrorBoundary>
      <AppServicesProvider services={services}>
        <ThemedRouter router={router} />
      </AppServicesProvider>
    </AppErrorBoundary>
  );
}

// Inside the provider, because `useViewModel` reads the services from it.
const ThemedRouter = observer(function ThemedRouter({ router }: { router: DataRouter }) {
  const vm = useViewModel((services) => new AppViewModel(services.event, services.session));
  if (!vm.isReady) {
    return <ThemeSplash />;
  }
  return (
    <ThemeRoot themeKey={vm.themeKey}>
      <RouterProvider router={router} />
    </ThemeRoot>
  );
});
