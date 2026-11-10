import type { ReactNode } from 'react';
import type { AppServices } from './AppServices';
import { AppServicesContext } from './AppServicesContext';

export function AppServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}
