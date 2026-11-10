import type { ThemeCatalog } from '@/domain/themeCatalog';
import { themeCatalog } from '@/theme/registry';

/**
 * Everything a view model can be given: services and stores that live as long as the app. Like a C# DI container's
 * registrations, but built by hand in one place. View models receive the pieces they need through their
 * constructor (see `useViewModel`), so a test builds a view model with fakes instead.
 * F2 adds the API classes and stores, F4 the game connection.
 */
export interface AppServices {
  themes: ThemeCatalog;
}

/** The composition root: called once by `main.tsx`. */
export function createAppServices(): AppServices {
  return {
    themes: themeCatalog,
  };
}
