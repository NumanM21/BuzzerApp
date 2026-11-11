import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createAppServices } from '@/app/AppServices';
import type { Me, Team } from '@/api/types';
import { appPaths } from '@/domain/paths';
import { makeAdminMe, makeMe, makeTeams, problem } from '@/test/factories';
import { FakeJoinCodeMemory } from '@/test/fakes/FakeJoinCodeMemory';
import { problemResponse } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/renderApp';

// The Teams screen with the real page, view models, stores and API classes over the fake network (MSW), so these
// also show the wire format. The rules and every error case are in the view-model tests.

/** What `GET /api/teams` shows `viewer`: an admin sees every real name, a player only their own. */
function teamsFor(viewer: Me, teams: Team[]): Team[] {
  return teams.map((team) => ({
    ...team,
    members: team.members.map((member) => ({
      ...member,
      realName: viewer.role === 'admin' || member.playerId === viewer.playerId ? `Real Name ${member.playerId}` : null,
    })),
  }));
}

/** Serves `teams` (which a test may replace) and `viewer`, then opens `/teams` once the cards are drawn. */
async function openTeams(viewer: Me, teams: { current: Team[] }) {
  server.use(
    http.get('/api/session/me', () => HttpResponse.json(viewer)),
    http.get('/api/teams', () => HttpResponse.json(teamsFor(viewer, teams.current))),
  );
  const services = createAppServices({
    fetchFunction: (input, init) => fetch(input, init),
    joinCodeMemory: new FakeJoinCodeMemory(),
  });
  const app = await renderApp(appPaths.teams, services);
  await screen.findByRole('heading', { name: 'Team 1' });
  return app;
}

describe('TeamsPage as an admin', () => {
  it('renames a team through the menu and the dialog, and shows the new name', async () => {
    const teams = { current: makeTeams(3, { membersPerTeam: 2 }) };
    let body: unknown;
    server.use(
      http.patch('/api/teams/:id', async ({ request, params }) => {
        body = await request.json();
        teams.current = teams.current.map((team) => (team.id === Number(params.id) ? { ...team, name: 'Quiz Kids' } : team));
        return HttpResponse.json({ ...teams.current[1] });
      }),
    );
    const { user } = await openTeams(makeAdminMe(), teams);

    await user.click(screen.getByRole('button', { name: 'Actions for Team 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename Team 2' });
    const input = within(dialog).getByLabelText('Team name');
    await user.clear(input);
    await user.type(input, 'Quiz Kids');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('heading', { name: 'Quiz Kids' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(body).toEqual({ name: 'Quiz Kids' });
  });

  it('shows every real name and a menu on every member', async () => {
    const teams = { current: makeTeams(2, { membersPerTeam: 2 }) };
    await openTeams(makeAdminMe(), teams);

    expect(screen.getByText('Real Name 4')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Actions for Player/ })).toHaveLength(4);
  });

  it('shows the server\'s refusal when a team with players is deleted, and keeps the team', async () => {
    const teams = { current: makeTeams(2, { membersPerTeam: 2 }) };
    server.use(
      http.delete('/api/teams/:id', () =>
        problemResponse(409, problem(409, { detail: 'The team still has players, scores or buzz history.' })),
      ),
    );
    const { user } = await openTeams(makeAdminMe(), teams);

    await user.click(screen.getByRole('button', { name: 'Actions for Team 1' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Team 1?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete team' }));

    expect(await within(dialog).findByText('The team still has players, scores or buzz history.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Team 1' })).toBeInTheDocument();
  });

  it('adds a team with a colour and icon of the pack', async () => {
    const teams = { current: makeTeams(2) };
    let body: unknown;
    server.use(
      http.post('/api/teams', async ({ request }) => {
        body = await request.json();
        teams.current = [...teams.current, { ...makeTeams(3)[2], name: 'Newcomers' }];
        return HttpResponse.json({ ...teams.current[2] }, { status: 201 });
      }),
    );
    const { user } = await openTeams(makeAdminMe(), teams);

    await user.click(screen.getByRole('button', { name: 'Add team' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a team' });
    await user.type(within(dialog).getByLabelText('Team name'), 'Newcomers');
    // The default pack's colours; the first free one and the first icon are already chosen.
    expect(await within(dialog).findAllByRole('radio')).not.toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Add team' }));

    expect(await screen.findByRole('heading', { name: 'Newcomers' })).toBeInTheDocument();
    expect(body).toMatchObject({ name: 'Newcomers' });
    expect(body).toHaveProperty('colorKey');
    expect(body).toHaveProperty('iconKey');
  });
});

describe('TeamsPage as a player', () => {
  it('edits their own display name, and the card shows it', async () => {
    const teams = { current: makeTeams(3, { membersPerTeam: 2 }) };
    const viewer = makeMe({ playerId: 1, displayName: 'Player 1', teamId: 1, teamName: 'Team 1' });
    let body: unknown;
    server.use(
      http.patch('/api/players/me', async ({ request }) => {
        body = await request.json();
        teams.current = teams.current.map((team) => ({
          ...team,
          members: team.members.map((member) => (member.playerId === 1 ? { ...member, displayName: 'Ace' } : member)),
        }));
        return HttpResponse.json({ id: 1, realName: 'Real Name 1', displayName: 'Ace', role: 'player', teamId: 1, teamName: 'Team 1' });
      }),
    );
    const { user } = await openTeams(viewer, teams);

    await user.click(screen.getByRole('button', { name: 'Edit your names' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit your names' });
    const display = within(dialog).getByLabelText('Display name');
    await user.clear(display);
    await user.type(display, 'Ace');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/^Ace/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Only the changed name goes on the wire.
    expect(body).toEqual({ displayName: 'Ace' });
  });

  // While a dialog is open the rest of the app is hidden from screen readers; once it is closed the app must be
  // readable again. (A dialog is closed by telling it so, not by removing it: see `useLastDefined`. That the real
  // browser also un-hides the page and returns the keyboard to the opening button can't be seen in jsdom; the F9
  // live walkthrough checks it, and it is in the Playwright backlog.)
  it('closes a dismissed dialog and leaves the screen readable, and the dialog can be opened again', async () => {
    const teams = { current: makeTeams(2, { membersPerTeam: 2 }) };
    const { user } = await openTeams(makeMe({ playerId: 1 }), teams);

    await user.click(screen.getByRole('button', { name: 'Edit your names' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit your names' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: 'Teams' })).toBeInTheDocument();
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit your names' }));
    expect(await screen.findByRole('dialog', { name: 'Edit your names' })).toBeInTheDocument();
  });

  it('sees every team but offers admin actions to no one, and real names only for themselves', async () => {
    const teams = { current: makeTeams(3, { membersPerTeam: 2 }) };
    await openTeams(makeMe({ playerId: 1 }), teams);

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Add team' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit your names' })).toHaveLength(1);
    expect(screen.getByText('Real Name 1')).toBeInTheDocument();
    expect(screen.queryByText('Real Name 2')).not.toBeInTheDocument();
  });
});
