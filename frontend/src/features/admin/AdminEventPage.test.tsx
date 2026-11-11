import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createAppServices } from '@/app/AppServices';
import { appPaths } from '@/domain/paths';
import { makeAdminMe, makeFinalizeResponse, makeMe, problem } from '@/test/factories';
import { FakeJoinCodeMemory } from '@/test/fakes/FakeJoinCodeMemory';
import { problemResponse } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/renderApp';

// The real page, view model and API class over the fake network (MSW), so this also shows the wire format: the
// finalize is a POST with no body, and the export is a link, never a request the app makes itself.

async function openEventScreen(me = makeAdminMe()) {
  server.use(http.get('/api/session/me', () => HttpResponse.json(me)));
  const services = createAppServices({
    fetchFunction: (input, init) => fetch(input, init),
    joinCodeMemory: new FakeJoinCodeMemory(),
  });
  const app = await renderApp(appPaths.adminEvent, services);
  return { ...app, heading: await screen.findByRole('heading', { name: 'Event' }) };
}

describe('AdminEventPage', () => {
  it('offers no download until the event has been finalized, then links to the export', async () => {
    const requests: string[] = [];
    server.use(
      http.post('/api/archive/finalize', ({ request }) => {
        requests.push(`${request.method} ${new URL(request.url).pathname}`);
        return HttpResponse.json(
          makeFinalizeResponse({ eventId: 5, year: 2031, finalizedAt: '2031-01-01T23:15:00.000Z' }),
        );
      }),
      http.get('/api/archive/:eventId/export', () => {
        requests.push('GET export');
        return new HttpResponse('{}');
      }),
    );
    const { user } = await openEventScreen();
    expect(screen.queryByRole('link', { name: /Download/ })).not.toBeInTheDocument();
    expect(screen.getByText('Finalize the event first, then the file can be downloaded here.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finalize the event' }));
    // Nothing is sent until the confirmation is accepted.
    expect(requests).toEqual([]);
    const dialog = await screen.findByRole('dialog', { name: 'Finalize the event?' });
    await user.click(within(dialog).getByRole('button', { name: 'Finalize' }));

    const link = await screen.findByRole('link', { name: 'Download buzzer-archive-2031.json' });
    expect(link).toHaveAttribute('href', '/api/archive/5/export');
    expect(link).toHaveAttribute('download', 'buzzer-archive-2031.json');
    expect(screen.getByRole('status')).toHaveTextContent(/^Finalized at /);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The file is fetched by the browser when the link is followed, never by the app.
    expect(requests).toEqual(['POST /api/archive/finalize']);
  });

  it('cancelling the confirmation sends nothing', async () => {
    const requests: string[] = [];
    server.use(
      http.post('/api/archive/finalize', () => {
        requests.push('finalize');
        return HttpResponse.json(makeFinalizeResponse());
      }),
    );
    const { user } = await openEventScreen();

    await user.click(screen.getByRole('button', { name: 'Finalize the event' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finalize the event?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it('keeps the dialog open with the server’s sentence when finalizing fails', async () => {
    server.use(
      http.post('/api/archive/finalize', () =>
        problemResponse(500, problem(500, { title: 'Server error', detail: 'The archive could not be built.' })),
      ),
    );
    const { user } = await openEventScreen();

    await user.click(screen.getByRole('button', { name: 'Finalize the event' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finalize the event?' });
    await user.click(within(dialog).getByRole('button', { name: 'Finalize' }));

    expect(await within(dialog).findByText('The archive could not be built.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('sends a player who types the address back to the buzzer', async () => {
    server.use(http.get('/api/session/me', () => HttpResponse.json(makeMe())));
    const services = createAppServices({
      fetchFunction: (input, init) => fetch(input, init),
      joinCodeMemory: new FakeJoinCodeMemory(),
    });
    const { router } = await renderApp(appPaths.adminEvent, services);

    expect(await screen.findByRole('heading', { name: 'Buzz' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.play);
  });
});
