import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createAppServices } from '@/app/AppServices';
import type { Me } from '@/api/types';
import { appPaths } from '@/domain/paths';
import { defaultCopy } from '@/theme/defaultCopy';
import { makeAdminMe, makeMe, makeTeamScores, problem } from '@/test/factories';
import { FakeJoinCodeMemory } from '@/test/fakes/FakeJoinCodeMemory';
import { problemResponse } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/renderApp';

// The leaderboard with the real page, view model, store and API class over the fake network (MSW). The rules and the
// shapes (several team counts, shared ranks) are in the view-model and component tests.

/** The team rows only: the shell's navigation is a list too. */
async function teamRows() {
  return within(screen.getByRole('main')).findAllByRole('listitem');
}

async function openScores(viewer: Me, scores = makeTeamScores(3)) {
  const adminListsAsked: string[] = [];
  server.use(
    http.get('/api/session/me', () => HttpResponse.json(viewer)),
    http.get('/api/scores/teams', () => HttpResponse.json(scores)),
    // A player's screen must never ask for these: the server would refuse, and it would be a leak if it didn't.
    http.get('/api/scores/players', () => {
      adminListsAsked.push('players');
      return HttpResponse.json([]);
    }),
    http.get('/api/scores/adjustments', () => {
      adminListsAsked.push('adjustments');
      return HttpResponse.json([]);
    }),
  );
  const services = createAppServices({
    fetchFunction: (input, init) => fetch(input, init),
    joinCodeMemory: new FakeJoinCodeMemory(),
  });
  const app = await renderApp(appPaths.scores, services);
  await screen.findByRole('heading', { name: 'Scores' });
  return { ...app, adminListsAsked };
}

describe('ScoresPage', () => {
  it('shows the teams in the server\'s order with their ranks and totals, and marks the player\'s own team', async () => {
    const { adminListsAsked } = await openScores(makeMe({ teamId: 2, teamName: 'Team 2' }));

    const items = await teamRows();

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Team 1');
    expect(items[0]).toHaveTextContent('30');
    expect(items[1]).toHaveTextContent(`Team 2 (${defaultCopy.teamYou})`);
    expect(items[2]).not.toHaveTextContent(`(${defaultCopy.teamYou})`);
    expect(adminListsAsked).toEqual([]);
  });

  it('shows equal totals with the same rank', async () => {
    await openScores(makeMe(), makeTeamScores(3, 0));

    const ranks = (await teamRows()).map((item) => item.firstElementChild?.textContent);

    expect(ranks).toEqual(['1', '1', '1']);
  });

  it('shows the same page to an admin, with no team marked and no admin lists asked for', async () => {
    const { adminListsAsked } = await openScores(makeAdminMe());

    const items = await teamRows();

    expect(items).toHaveLength(3);
    expect(within(items[0]).queryByText(new RegExp(`\\(${defaultCopy.teamYou}\\)`))).not.toBeInTheDocument();
    expect(adminListsAsked).toEqual([]);
  });

  it('shows the server\'s message with a way to try again when the scores cannot be loaded', async () => {
    server.use(
      http.get('/api/session/me', () => HttpResponse.json(makeMe())),
      http.get('/api/scores/teams', () => problemResponse(500, problem(500, { title: 'The scores are unavailable' }))),
    );
    const services = createAppServices({
      fetchFunction: (input, init) => fetch(input, init),
      joinCodeMemory: new FakeJoinCodeMemory(),
    });
    const { user } = await renderApp(appPaths.scores, services);

    expect(await screen.findByText('The scores are unavailable')).toBeInTheDocument();

    server.use(http.get('/api/scores/teams', () => HttpResponse.json(makeTeamScores(2))));
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await teamRows()).toHaveLength(2);
    expect(screen.queryByText('The scores are unavailable')).not.toBeInTheDocument();
  });
});
