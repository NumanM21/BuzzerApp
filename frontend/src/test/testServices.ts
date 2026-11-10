import type { AppServices } from '@/app/AppServices';
import { FakeThemeCatalog, makePackKeys } from './fakes/FakeThemeCatalog';

/** `AppServices` built from fakes, with any piece replaced by the test. */
export function createTestServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    themes: new FakeThemeCatalog({ default: makePackKeys(3, 2) }),
    ...overrides,
  };
}
