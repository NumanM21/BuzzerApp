import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appPaths } from '@/domain/paths';
import { makeAdminMe } from '@/test/factories';
import { renderApp } from '@/test/renderApp';
import { createTestFakes, createTestServices } from '@/test/testServices';

// The host screen is a file of its own, fetched when an admin first opens it. Here that download fails, as it does on
// a flaky connection, or on a phone that still holds the page from before a redeploy and asks for a file that is gone.
// (In its own test file because `vi.mock` applies to the whole file.)
vi.mock('@/features/admin/AdminPage', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

// React and the router both report the caught error on the console; that is expected here.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('routes: a screen whose file fails to load', () => {
  it('shows the error screen with a reload, and keeps the header and navigation', async () => {
    const fakes = createTestFakes();
    fakes.sessionApi.me = makeAdminMe({ displayName: 'Hosty' });

    await renderApp(appPaths.adminHost, createTestServices({}, fakes));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument();
    // The shell is still there, so the host can also just go to another screen.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByText('Hosty')).toBeInTheDocument();
  });
});
