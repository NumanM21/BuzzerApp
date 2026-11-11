import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { appPaths } from '@/domain/paths';
import { makeAdminMe, makeAdminSnapshot, makeBuzzes, makeMe, makeTeamQueue, makeTeams } from '@/test/factories';
import { renderApp } from '@/test/renderApp';
import { createTestFakes, createTestServices } from '@/test/testServices';

async function visit(me: Me = makeAdminMe()) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  fakes.teamsApi.teams = makeTeams(3);
  const result = await renderApp(appPaths.adminHost, createTestServices({}, fakes));
  await screen.findByRole('heading', { name: 'Host' });
  return { ...result, connection: fakes.connection };
}

const button = (name: string) => screen.getByRole('button', { name });

describe('AdminPage', () => {
  it('runs a round: Begin, a locked queue with the buzz list, Next team, Reset', async () => {
    const { connection, user } = await visit();
    // Nothing yet from the admin stream: the screen says so instead of showing an empty round.
    expect(screen.getByText('Not connected to the game')).toBeInTheDocument();
    expect(button('Begin')).toBeDisabled();

    act(() => {
      connection.setState('connected');
      connection.emitAdminRoundUpdated(makeAdminSnapshot({ version: 1 }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('No question in play');
    expect(button('Begin')).toBeEnabled();
    expect(button('Next team')).toBeDisabled();
    expect(button('Reset')).toBeDisabled();

    await user.click(button('Begin'));
    expect(connection.calls).toContain('beginRound');

    const queue = makeTeamQueue([3, 1]);
    act(() => {
      connection.emitAdminRoundUpdated(
        makeAdminSnapshot({
          version: 2,
          roundId: 'r',
          phase: 'open',
          teamQueue: queue,
          buzzes: [
            ...makeBuzzes(queue),
            { sequence: 3, playerId: 31, displayName: 'Player 31', teamId: 3, teamName: 'Team 3', offsetMs: 210, countedForTeam: false },
          ],
        }),
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for buzzes');
    expect(button('Begin')).toBeDisabled();
    expect(button('Reset')).toBeEnabled();
    const buzzes = within(screen.getByRole('region', { name: 'Every buzz' })).getAllByRole('listitem');
    expect(buzzes.map((item) => item.textContent)).toEqual([
      '#1 Player 30 (Team 3) +0.00s',
      '#2 Player 10 (Team 1) +0.10s',
      '#3 Player 31 (Team 3) +0.21s · not counted',
    ]);

    act(() => {
      connection.emitAdminRoundUpdated(
        makeAdminSnapshot({
          version: 3,
          roundId: 'r',
          phase: 'locked',
          teamQueue: makeTeamQueue([3, 1], (index) => (index === 0 ? 'current' : 'waiting')),
          currentTeamId: 3,
          currentSince: '2030-01-01T20:00:00.000Z',
          serverNow: '2030-01-01T20:00:00.000Z',
        }),
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent('Locked');
    const answering = screen.getByRole('region', { name: 'Answering now' });
    expect(answering).toHaveTextContent('Team 3, buzzed in by Player 30');
    expect(within(answering).getByRole('timer')).toHaveTextContent(/^\d+:\d{2}\.\d$/);
    // The queue marks who is answering in words, not only by look.
    const order = within(screen.getByRole('region', { name: 'Team order' })).getAllByRole('listitem');
    expect(order[0]).toHaveTextContent('Answering');
    expect(order[1]).toHaveTextContent('Waiting');

    await user.click(button('Next team'));
    expect(connection.calls).toContain('nextTeam');

    act(() => {
      connection.emitAdminRoundUpdated(
        makeAdminSnapshot({
          version: 4,
          roundId: 'r',
          phase: 'exhausted',
          teamQueue: makeTeamQueue([3, 1], () => 'passed'),
        }),
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent('Every team has passed');
    expect(screen.queryByRole('region', { name: 'Answering now' })).not.toBeInTheDocument();
    expect(button('Next team')).toBeDisabled();

    await user.click(button('Reset'));
    expect(connection.calls).toContain('resetRound');
  });

  it("shows the server's refusal in words when Begin can't start a round", async () => {
    const { connection, user } = await visit();
    connection.answers.beginRound = { success: false, error: 'round.emptyRoster', changed: false };
    act(() => {
      connection.setState('connected');
      connection.emitAdminRoundUpdated(makeAdminSnapshot({ version: 1 }));
    });

    await user.click(button('Begin'));

    expect(await screen.findByText('No players have joined a team yet')).toBeInTheDocument();
    expect(button('Begin')).toBeEnabled();
  });

  it('warns, and disables the buttons, while the connection is down', async () => {
    const { connection } = await visit();
    act(() => {
      connection.setState('connected');
      connection.emitAdminRoundUpdated(makeAdminSnapshot({ version: 1, roundId: 'r', phase: 'open' }));
    });
    expect(button('Reset')).toBeEnabled();

    act(() => {
      connection.drop();
    });

    expect(screen.getByText('Connection lost. Reconnecting…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for buzzes');
    expect(button('Reset')).toBeDisabled();
  });

  it('sends a player who types the address back to the buzzer', async () => {
    const fakes = createTestFakes();
    fakes.sessionApi.me = makeMe();
    const { router } = await renderApp(appPaths.adminHost, createTestServices({}, fakes));

    expect(await screen.findByRole('heading', { name: 'Buzz' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(appPaths.play);
  });
});
