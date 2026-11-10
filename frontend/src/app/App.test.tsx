import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { EventInfo } from '@/api/types';
import { deferred } from '@/test/deferred';
import { makeEventInfo } from '@/test/factories';
import { createTestFakes, createTestServices } from '@/test/testServices';
import { App } from './App';

function renderApp(fakes = createTestFakes()) {
  const router = createMemoryRouter([{ path: '/', element: <p>The page</p> }]);
  render(<App services={createTestServices({}, fakes)} router={router} />);
  return fakes;
}

describe('App', () => {
  it('shows only the splash until the event is known, then the page in its theme', async () => {
    const fakes = createTestFakes();
    const slow = deferred<EventInfo>();
    fakes.eventApi.getEvent = () => slow.promise;
    renderApp(fakes);

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText('The page')).not.toBeInTheDocument();

    await act(async () => {
      slow.resolve(makeEventInfo());
    });

    expect(await screen.findByText('The page')).toBeInTheDocument();
  });

  it('still shows the page, in the default theme, when the event cannot be loaded', async () => {
    const fakes = createTestFakes();
    fakes.eventApi.failNext(ApiError.network());

    await act(async () => {
      renderApp(fakes);
    });

    expect(await screen.findByText('The page')).toBeInTheDocument();
  });

  it('falls back to the default theme for a theme key no pack has', async () => {
    const fakes = createTestFakes();
    fakes.eventApi.event = makeEventInfo({ themeKey: 'a-pack-that-does-not-exist' });

    await act(async () => {
      renderApp(fakes);
    });

    expect(await screen.findByText('The page')).toBeInTheDocument();
  });

  it('asks the server who this phone is', async () => {
    const fakes = createTestFakes();

    await act(async () => {
      renderApp(fakes);
    });

    expect(fakes.sessionApi.calls).toContain('getMe');
  });
});
