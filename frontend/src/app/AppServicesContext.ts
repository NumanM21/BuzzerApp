import { createContext, useContext } from 'react';
import type { AppServices } from './AppServices';

export const AppServicesContext = createContext<AppServices | undefined>(undefined);

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (!services) {
    throw new Error('useAppServices needs an AppServicesContext provider above it (App or renderWithApp).');
  }
  return services;
}
