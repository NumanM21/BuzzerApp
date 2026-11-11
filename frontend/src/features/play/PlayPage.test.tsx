import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { appPaths } from '@/domain/paths';
import { defaultCopy } from '@/theme/defaultCopy';
import { makeMe, makePublicSnapshot, makeTeamQueue, makeTeams } from '@/test/factories';
import { renderApp } from '@/test/renderApp';
import { createTestFakes, createTestServices } from '@/test/testServices';

async function visit(me: Me | undefined = makeMe({ teamId: 2, teamName: 'Team 2' })) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  fakes.teamsApi.teams = makeTeams(3);
  const result = await renderApp(appPaths.play, createTestServices({}, fakes));
  await screen.findByRole('heading', { name: 'Buzz' });
  return { ...result, connection: fakes.connection };
}

// The page's other list is the navigation, so find the queue by its heading.
function queueItems(): HTMLElement[] {
  const section = screen.getByRole('heading', { name: 'Team order' }).closest('section');
  if (!section) {
    throw new Error('No queue section');
  }
  return within(section).getAllByRole('listitem');
}

describe('PlayPage', () => {
  it('follows a round: open, buzz, in line, then your team is up', async () => {
    const { connection, user } = await visit();
    act(() => {
      connection.setState('connected');
      connection.emitRoundUpdated(makePublicSnapshot({ version: 1, roundId: 'r', phase: 'open' }));
    });

    const buzzer = screen.getByRole('button', { name: new RegExp(defaultCopy.buzzerReady) });
    expect(buzzer).toBeEnabled();
    await user.click(buzzer);

    // Sent at once: the button answers before the server's snapshot arrives.
    expect(connection.calls.filter((call) => call === 'buzz')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Sent/ })).toBeDisabled();

    act(() => {
      connection.emitRoundUpdated(
        makePublicSnapshot({ version: 2, roundId: 'r', phase: 'open', teamQueue: makeTeamQueue([3, 2]) }),
      );
    });
    expect(screen.getByRole('button', { name: new RegExp(`${defaultCopy.buzzerQueued}.*Number 2`) })).toBeDisabled();
    expect(queueItems()[1]).toHaveTextContent(`Team 2 (${defaultCopy.teamYou})`);

    act(() => {
      connection.emitRoundUpdated(
        makePublicSnapshot({
          version: 3,
          roundId: 'r',
          phase: 'locked',
          teamQueue: makeTeamQueue([3, 2], (index) => (index === 0 ? 'passed' : 'current')),
        }),
      );
    });
    expect(screen.getByRole('button', { name: new RegExp(defaultCopy.buzzerYourTeamUp) })).toBeInTheDocument();
    expect(queueItems()[1]).toHaveTextContent('Answering');
  });

  it('tells the person when they joined too late for this round', async () => {
    const { connection, user } = await visit();
    connection.answers.buzz = { success: false, error: 'round.unknownPlayer', changed: false };
    act(() => {
      connection.setState('connected');
      connection.emitRoundUpdated(makePublicSnapshot({ roundId: 'r', phase: 'open' }));
    });

    await user.click(screen.getByRole('button', { name: new RegExp(defaultCopy.buzzerReady) }));

    expect(await screen.findByText("You're in from the next round")).toBeInTheDocument();
  });

  it('warns while disconnected and keeps the buzzer from being pressed', async () => {
    const { connection } = await visit();
    act(() => {
      connection.setState('connected');
      connection.emitRoundUpdated(makePublicSnapshot({ roundId: 'r', phase: 'open' }));
    });

    act(() => connection.drop());

    expect(screen.getByText('Connection lost. Reconnecting…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(defaultCopy.buzzerReady) })).toBeDisabled();
  });
});
