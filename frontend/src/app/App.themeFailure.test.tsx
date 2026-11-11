import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestServices } from '@/test/testServices';
import { App } from './App';

// The theme pack is a file of its own. Here its download fails (the test event uses the default pack).
// (In its own test file because `vi.mock` applies to the whole file.)
vi.mock('@/theme/packs/default', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

// React reports the caught error on the console; that is expected here.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('App: the theme pack fails to load', () => {
  it('shows the error screen with a reload instead of a blank page', async () => {
    const router = createMemoryRouter([{ path: '/', element: <p>The page</p> }]);

    await act(async () => {
      render(<App services={createTestServices()} router={router} />);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.queryByText('The page')).not.toBeInTheDocument();
  });
});
