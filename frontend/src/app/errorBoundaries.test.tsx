import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary, RouteErrorScreen } from './errorBoundaries';

function Broken(): never {
  throw new Error('A file of the app did not arrive.');
}

// React and the router both report a caught error on the console; that is expected here, so keep the output quiet.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('shows what is inside it while nothing fails', () => {
    render(
      <AppErrorBoundary>
        <p>The app</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('The app')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error screen instead of a blank page when something inside it throws', () => {
    render(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('offers a reload', async () => {
    const onReload = vi.fn();
    render(
      <AppErrorBoundary onReload={onReload}>
        <Broken />
      </AppErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });
});

describe('RouteErrorScreen', () => {
  it("replaces the router's own developer error page for a route that throws", async () => {
    const router = createMemoryRouter([
      { ErrorBoundary: RouteErrorScreen, children: [{ path: '/', Component: Broken }] },
    ]);
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
