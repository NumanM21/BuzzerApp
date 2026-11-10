import { useEffect, useState } from 'react';
import type { AppServices } from './AppServices';
import { useAppServices } from './AppServicesContext';

/**
 * The optional lifecycle of a view model. Most need neither method: they are computed views over stores.
 * `activate` is for "make sure my stores are loaded" and for timers; `dispose` undoes exactly what `activate` did.
 *
 * Both must be safe to call in the order activate → dispose → activate, because React's StrictMode does exactly
 * that in development to flush out effects that can't be undone.
 */
export interface ViewModel {
  activate?(): void;
  dispose?(): void;
}

/**
 * Creates a view's view model once per mounted view and ties its lifecycle to the view's:
 * `const vm = useViewModel((services) => new TeamsViewModel(services.teams));`
 *
 * The view model lives in `useState` so it survives re-renders; it is not rebuilt when `create` changes.
 */
export function useViewModel<T extends object>(create: (services: AppServices) => T): T {
  const services = useAppServices();
  const [viewModel] = useState(() => create(services));

  useEffect(() => {
    // `T extends ViewModel` would reject every view model without activate/dispose (TypeScript refuses a type with
    // no properties in common with an all-optional one), so the lifecycle is read through the interface instead.
    const lifecycle: ViewModel = viewModel;
    lifecycle.activate?.();
    return () => lifecycle.dispose?.();
  }, [viewModel]);

  return viewModel;
}
