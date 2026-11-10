import { act, render } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createMemoryRouter, type DataRouter } from 'react-router';
import { App } from '@/app/App';
import type { AppServices } from '@/app/AppServices';
import { createAppRoutes } from '@/app/routes';
import { createTestServices } from './testServices';

export interface RenderAppResult {
  services: AppServices;
  router: DataRouter;
  user: UserEvent;
}

/**
 * The whole app (start-up, theme, guards, the real route table) at `route`, in a memory router. Pass services built
 * over fakes (`createTestServices`) or over MSW (`createAppServices`). Resolves once the first render, including the
 * theme pack's loading, has settled.
 */
export async function renderApp(route: string, services: AppServices = createTestServices()): Promise<RenderAppResult> {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: [route] });
  const user = userEvent.setup();
  await act(async () => {
    render(<App services={services} router={router} />);
  });
  return { services, router, user };
}
