import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import type { Me } from '@/api/types';
import { appPaths } from '@/domain/paths';
import { deferred } from '@/test/deferred';
import { makeAdminMe, makeMe } from '@/test/factories';
import { renderApp } from '@/test/renderApp';
import { createTestFakes, createTestServices } from '@/test/testServices';

// The guards and the route table as a person meets them: where each kind of visitor ends up for each address.
// The rules themselves are covered case by case in `domain/routeAccess.test.ts`.

async function visit(route: string, me: Me | undefined) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  const result = await renderApp(route, createTestServices({}, fakes));
  return { ...result, fakes };
}

const joinHeading = () => screen.findByRole('heading', { name: 'Join the game' });

describe('routes: an anonymous visitor', () => {
  it.each([appPaths.play, appPaths.teams, appPaths.scores, appPaths.adminHost, appPaths.adminScores, appPaths.adminEvent])(
    'is sent from %s to the join screen',
    async (path) => {
      const { router } = await visit(path, undefined);

      expect(await joinHeading()).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(appPaths.join);
    },
  );

  it.each(['/', '/no-such-page', '/play/extra'])('is sent from %s to the join screen', async (path) => {
    const { router } = await visit(path, undefined);

    expect(await joinHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.join);
  });
});

describe('routes: a player', () => {
  it.each(['/', appPaths.join, '/no-such-page', appPaths.adminHost, appPaths.adminScores, appPaths.adminEvent])(
    'is sent from %s to the buzz screen',
    async (path) => {
      const { router } = await visit(path, makeMe());

      expect(await screen.findByRole('heading', { name: 'Buzz' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(appPaths.play);
    },
  );

  it.each([
    [appPaths.teams, 'Teams'],
    [appPaths.scores, 'Scores'],
  ])('may open %s', async (path, title) => {
    const { router } = await visit(path, makeMe());

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });

  it('sees the player navigation around every screen', async () => {
    await visit(appPaths.teams, makeMe({ displayName: 'Nick' }));

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(nav).toHaveTextContent('BuzzTeamsScores');
    expect(screen.getByText('Nick')).toBeInTheDocument();
  });
});

describe('routes: an admin', () => {
  it.each(['/', appPaths.join, '/no-such-page', appPaths.play])('is sent from %s to the host screen', async (path) => {
    const { router } = await visit(path, makeAdminMe());

    expect(await screen.findByRole('heading', { name: 'Host' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.adminHost);
  });

  it.each([
    [appPaths.adminScores, 'Scores'],
    [appPaths.adminEvent, 'Event'],
    [appPaths.teams, 'Teams'],
    [appPaths.scores, 'Scores'],
  ])('may open %s', async (path, title) => {
    const { router } = await visit(path, makeAdminMe());

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });

  it('sees the admin navigation around every screen', async () => {
    await visit(appPaths.adminHost, makeAdminMe());

    expect(await screen.findByRole('navigation', { name: 'Main' })).toHaveTextContent('HostTeamsScoresEvent');
  });
});

describe('routes: while the session is not known yet', () => {
  it('shows the splash and neither the join screen nor a signed-in screen', async () => {
    const fakes = createTestFakes();
    const slow = deferred<Me>();
    fakes.sessionApi.getMe = () => slow.promise;

    await renderApp(appPaths.play, createTestServices({}, fakes));

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByRole('heading', { name: 'Join the game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Buzz' })).not.toBeInTheDocument();
  });

  it('offers a retry when the server cannot be reached, and carries on to the screen once it can', async () => {
    const fakes = createTestFakes();
    fakes.sessionApi.me = makeMe();
    fakes.sessionApi.failNext(ApiError.network());
    const { user } = await renderApp(appPaths.play, createTestServices({}, fakes));

    expect(screen.getByText(ApiError.network().message)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Join the game' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Buzz' })).toBeInTheDocument();
  });
});

describe('routes: signing out', () => {
  it('sends the person to the join screen, and the back button does not bring a signed-in screen back', async () => {
    const { user, router } = await visit(appPaths.teams, makeMe());
    await screen.findByRole('heading', { name: 'Teams' });
    // A second screen, so the history has an entry for the back button to return to.
    await user.click(screen.getByRole('link', { name: 'Scores' }));
    await screen.findByRole('heading', { name: 'Scores' });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await joinHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.join);

    await act(async () => {
      await router.navigate(-1);
    });

    expect(await joinHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.join);
    expect(screen.queryByRole('heading', { name: 'Teams' })).not.toBeInTheDocument();
  });

  it('keeps the person signed in and says so when the server cannot be reached', async () => {
    const { user, fakes } = await visit(appPaths.teams, makeMe());
    await screen.findByRole('heading', { name: 'Teams' });
    fakes.sessionApi.failNext(ApiError.network());

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText(ApiError.network().message)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Teams' })).toBeInTheDocument();
  });
});
