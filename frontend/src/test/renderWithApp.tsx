import { act, render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { AppServices } from '@/app/AppServices';
import { AppServicesProvider } from '@/app/AppServicesProvider';
import defaultPack from '@/theme/packs/default';
import { ThemePackProvider } from '@/theme/ThemeRoot';
import type { ThemePack } from '@/theme/types';
import { createTestServices } from './testServices';

interface RenderWithAppOptions {
  services?: AppServices;
  /** Already loaded, so the first render shows the page instead of the theme's loading splash. */
  pack?: ThemePack;
  /** The URL the memory router starts at. */
  route?: string;
}

export interface RenderWithAppResult extends RenderResult {
  services: AppServices;
  user: UserEvent;
}

/**
 * Renders a view the way the app does: services, theme (Fluent components need a FluentProvider) and a router.
 * Uses a memory router, so tests never touch the real address bar.
 */
export function renderWithApp(ui: ReactElement, options: RenderWithAppOptions = {}): RenderWithAppResult {
  const { services = createTestServices(), pack = defaultPack, route = '/' } = options;
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [route] });
  const user = userEvent.setup();
  const result = render(
    <AppServicesProvider services={services}>
      <ThemePackProvider pack={pack}>
        <RouterProvider router={router} />
      </ThemePackProvider>
    </AppServicesProvider>,
  );
  return { ...result, services, user };
}

/**
 * `renderWithApp` for a view that suspends while it renders, such as one with its own `ThemeRoot` that has to load
 * a pack. Awaiting lets React finish rendering before the test looks at the page.
 */
export async function renderWithAppAsync(
  ui: ReactElement,
  options: RenderWithAppOptions = {},
): Promise<RenderWithAppResult> {
  let result: RenderWithAppResult | undefined;
  await act(async () => {
    result = renderWithApp(ui, options);
  });
  if (!result) {
    throw new Error('Render did not run.');
  }
  return result;
}
