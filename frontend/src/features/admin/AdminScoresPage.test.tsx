import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createAppServices } from '@/app/AppServices';
import type { Adjustment, TeamScore } from '@/api/types';
import { appPaths } from '@/domain/paths';
import { makeAdminMe, makePlayerScores, makeTeamScores, problem } from '@/test/factories';
import { FakeJoinCodeMemory } from '@/test/fakes/FakeJoinCodeMemory';
import { problemResponse } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/renderApp';

// The admin scoring screen with the real page, view models, stores and API classes over the fake network (MSW), so
// these also show the wire format. The rules and every error case are in the view-model tests.

/** A tiny server: team totals and a ledger that the page's writes change, as the real one would. */
function serveScores(teamCount = 3) {
  const state = {
    teams: makeTeamScores(teamCount, 0) as TeamScore[],
    adjustments: [] as Adjustment[],
    bodies: [] as unknown[],
  };
  const ranked = () => {
    const sorted = [...state.teams].sort((a, b) => b.total - a.total || a.teamId - b.teamId);
    return sorted.map((team) => ({ ...team, rank: sorted.filter((other) => other.total > team.total).length + 1 }));
  };
  server.use(
    http.get('/api/session/me', () => HttpResponse.json(makeAdminMe())),
    http.get('/api/scores/teams', () => HttpResponse.json(ranked())),
    http.get('/api/scores/players', () => HttpResponse.json(makePlayerScores(4, teamCount))),
    http.get('/api/scores/adjustments', () => HttpResponse.json(state.adjustments)),
    http.post('/api/scores/adjustments', async ({ request }) => {
      const body = (await request.json()) as {
        target: 'team' | 'player';
        targetId: number;
        amount: number;
        multiplier: number;
        direction: 'add' | 'remove';
        reason?: string;
      };
      state.bodies.push(body);
      const signed = (body.direction === 'add' ? 1 : -1) * body.amount * body.multiplier;
      state.teams = state.teams.map((team) =>
        body.target === 'team' && team.teamId === body.targetId ? { ...team, total: team.total + signed } : team,
      );
      const adjustment: Adjustment = {
        id: state.adjustments.length + 1,
        target: body.target,
        targetId: body.targetId,
        targetName: `Team ${body.targetId}`,
        amount: signed,
        reason: body.reason ?? null,
        reversesAdjustmentId: null,
        isReversed: false,
        createdAt: '2030-01-01T20:00:00.000Z',
        createdByDisplayName: 'Host',
      };
      state.adjustments = [adjustment, ...state.adjustments];
      return HttpResponse.json(adjustment, { status: 201 });
    }),
  );
  return state;
}

async function openAdminScores() {
  const services = createAppServices({
    fetchFunction: (input, init) => fetch(input, init),
    joinCodeMemory: new FakeJoinCodeMemory(),
  });
  const app = await renderApp(appPaths.adminScores, services);
  await screen.findByRole('heading', { name: 'Add or remove points' });
  const standings = await screen.findByRole('region', { name: 'Team standings' });
  await within(standings).findByText('Team 1');
  return { ...app, standings };
}

describe('AdminScoresPage', () => {
  it('adds points to a team and shows the new total and the change in the recent list', async () => {
    const state = serveScores();
    const { user, standings } = await openAdminScores();

    await user.selectOptions(screen.getByLabelText('Team or player'), 'Team 2');
    await user.type(screen.getByLabelText('Points'), '10');
    const multiplier = screen.getByLabelText('Multiplier');
    await user.clear(multiplier);
    await user.type(multiplier, '3');
    await user.click(screen.getByRole('button', { name: 'Add +30' }));

    // Only what the person chose goes on the wire; an empty reason is left out.
    expect(state.bodies).toEqual([{ target: 'team', targetId: 2, amount: 10, multiplier: 3, direction: 'add' }]);
    expect(await screen.findByText('Saved: +30 for Team 2')).toBeInTheDocument();
    // The standings are re-ranked by the server's answer: Team 2 is now first.
    const [first] = within(standings).getAllByRole('listitem');
    expect(first).toHaveTextContent('Team 2');
    expect(first).toHaveTextContent('30');
    const recent = screen.getByRole('region', { name: 'Recent changes' });
    expect(within(recent).getByText('+30')).toBeInTheDocument();
    expect(within(recent).getByText('Team: Team 2')).toBeInTheDocument();
    // The numbers start over, ready for the next entry.
    expect(screen.getByLabelText('Points')).toHaveValue('');
  });

  it('removes points from a team', async () => {
    const state = serveScores();
    const { user } = await openAdminScores();

    await user.selectOptions(screen.getByLabelText('Team or player'), 'Team 1');
    await user.type(screen.getByLabelText('Points'), '5');
    await user.type(screen.getByLabelText('Reason (optional)'), 'Wrong answer');
    await user.click(screen.getByRole('button', { name: 'Remove −5' }));

    expect(state.bodies).toEqual([
      { target: 'team', targetId: 1, amount: 5, multiplier: 1, direction: 'remove', reason: 'Wrong answer' },
    ]);
    const recent = screen.getByRole('region', { name: 'Recent changes' });
    expect(await within(recent).findByText('−5')).toBeInTheDocument();
    expect(within(recent).getByText('Wrong answer')).toBeInTheDocument();
  });

  it('shows what is wrong next to the box and sends nothing when the form is incomplete', async () => {
    const state = serveScores();
    const { user } = await openAdminScores();

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Pick a team or a player')).toBeInTheDocument();
    expect(screen.getByText('Enter a whole number above 0')).toBeInTheDocument();
    expect(state.bodies).toEqual([]);
  });

  it('shows the server\'s message on the box it names', async () => {
    serveScores();
    server.use(
      http.post('/api/scores/adjustments', () =>
        problemResponse(400, problem(400, { errors: { reason: ['The reason is too long.'] } })),
      ),
    );
    const { user } = await openAdminScores();

    await user.selectOptions(screen.getByLabelText('Team or player'), 'Team 1');
    await user.type(screen.getByLabelText('Points'), '5');
    await user.click(screen.getByRole('button', { name: 'Add +5' }));

    expect(await screen.findByText('The reason is too long.')).toBeInTheDocument();
    // What was typed is still there for another try.
    expect(screen.getByLabelText('Points')).toHaveValue('5');
  });

  it('undoes a change, and then offers no Undo on the undo itself', async () => {
    const state = serveScores();
    server.use(
      http.post('/api/scores/adjustments/:id/reverse', ({ params }) => {
        const original = state.adjustments.find((row) => row.id === Number(params.id));
        if (!original) {
          return problemResponse(404, problem(404));
        }
        const undo: Adjustment = {
          ...original,
          id: state.adjustments.length + 1,
          amount: -original.amount,
          reversesAdjustmentId: original.id,
          isReversed: false,
        };
        state.teams = state.teams.map((team) =>
          team.teamId === original.targetId ? { ...team, total: team.total - original.amount } : team,
        );
        state.adjustments = [undo, ...state.adjustments.map((row) => (row.id === original.id ? { ...row, isReversed: true } : row))];
        return HttpResponse.json(undo, { status: 201 });
      }),
    );
    const { user } = await openAdminScores();
    await user.selectOptions(screen.getByLabelText('Team or player'), 'Team 3');
    await user.type(screen.getByLabelText('Points'), '8');
    await user.click(screen.getByRole('button', { name: 'Add +8' }));
    const recent = screen.getByRole('region', { name: 'Recent changes' });

    await user.click(await within(recent).findByRole('button', { name: 'Undo +8 for Team 3' }));

    expect(await within(recent).findByText('Undoes an earlier change')).toBeInTheDocument();
    expect(within(recent).getByText('Undone')).toBeInTheDocument();
    expect(within(recent).queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();
  });

  it('says so politely when someone else already undid the change, and shows the list as it is now', async () => {
    const state = serveScores();
    const { user } = await openAdminScores();
    await user.selectOptions(screen.getByLabelText('Team or player'), 'Team 1');
    await user.type(screen.getByLabelText('Points'), '8');
    await user.click(screen.getByRole('button', { name: 'Add +8' }));
    const recent = screen.getByRole('region', { name: 'Recent changes' });
    const undoButton = await within(recent).findByRole('button', { name: 'Undo +8 for Team 1' });
    // The other admin's undo lands before this admin taps.
    state.adjustments = state.adjustments.map((row) => ({ ...row, isReversed: true }));
    server.use(
      http.post('/api/scores/adjustments/:id/reverse', () =>
        problemResponse(409, problem(409, { detail: 'That change has already been undone.' })),
      ),
    );

    await user.click(undoButton);

    expect(await within(recent).findByText('That change has already been undone.')).toBeInTheDocument();
    expect(await within(recent).findByText('Undone')).toBeInTheDocument();
    expect(within(recent).queryByRole('button', { name: /^Undo/ })).not.toBeInTheDocument();
  });

  it('lists every player with their team, and re-sorts by score when asked', async () => {
    serveScores();
    const { user } = await openAdminScores();
    const players = await screen.findByRole('region', { name: 'Players' });
    const names = () => within(players).getAllByRole('listitem').map((item) => item.textContent ?? '');

    // makePlayerScores gives the first player the highest total and spreads them over teams 1, 2, 3, 1.
    expect(await within(players).findAllByRole('listitem')).toHaveLength(4);
    expect(names()[0]).toContain('Player 1');
    expect(names()[1]).toContain('Player 4');

    await user.click(within(players).getByRole('radio', { name: 'Sort by Score' }));

    expect(names().map((text) => text.slice(0, 8))).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
  });
});
