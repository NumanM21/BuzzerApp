import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildQueueRows, UNKNOWN_TEAM_KEY } from '@/domain/queueRows';
import { PERSON_NAME_MAX_LENGTH, TEAM_NAME_MAX_LENGTH } from '@/domain/names';
import { defaultCopy } from '@/theme/defaultCopy';
import { makeTeamQueue } from '@/test/factories';
import { renderWithApp } from '@/test/renderWithApp';
import { TeamQueue } from './TeamQueue';

function rowsFor(teamIds: readonly number[], myTeamId?: number, statusAt?: Parameters<typeof makeTeamQueue>[1]) {
  return buildQueueRows(makeTeamQueue(teamIds, statusAt), myTeamId, new Map());
}

describe('TeamQueue', () => {
  it.each([1, 2, 6, 13])('lists %i teams in the order given', (count) => {
    const ids = Array.from({ length: count }, (_, index) => count - index);
    renderWithApp(<TeamQueue rows={rowsFor(ids)} />);

    const items = screen.getAllByRole('listitem');

    expect(items).toHaveLength(count);
    items.forEach((item, index) => {
      expect(item).toHaveTextContent(`Team ${ids[index]}`);
      expect(within(item).getByText(String(index + 1))).toBeInTheDocument();
    });
  });

  it('says in words whose turn each team has, and who buzzed', () => {
    const statuses = ['passed', 'current', 'waiting'] as const;
    renderWithApp(<TeamQueue rows={rowsFor([1, 2, 3], undefined, (index) => statuses[index])} />);

    const [out, answering, waiting] = screen.getAllByRole('listitem');

    expect(out).toHaveTextContent('Out');
    expect(answering).toHaveTextContent('Answering');
    expect(waiting).toHaveTextContent('Waiting');
    expect(answering).toHaveTextContent('Buzzed by Player 20');
  });

  it('marks the viewer’s own team with words', () => {
    renderWithApp(<TeamQueue rows={rowsFor([1, 2], 2)} />);

    const [first, second] = screen.getAllByRole('listitem');

    expect(first).not.toHaveTextContent(`(${defaultCopy.teamYou})`);
    expect(second).toHaveTextContent(`Team 2 (${defaultCopy.teamYou})`);
  });

  it('draws a team the pack does not know without failing', () => {
    const rows = rowsFor([1]).map((row) => ({ ...row, colorKey: UNKNOWN_TEAM_KEY, iconKey: UNKNOWN_TEAM_KEY }));

    renderWithApp(<TeamQueue rows={rows} />);

    expect(screen.getByRole('listitem')).toHaveTextContent('Team 1');
  });

  it('shows the longest team and display names in full', () => {
    const [row] = rowsFor([1]);
    const longTeam = 'T'.repeat(TEAM_NAME_MAX_LENGTH);
    const longPerson = 'P'.repeat(PERSON_NAME_MAX_LENGTH);

    renderWithApp(<TeamQueue rows={[{ ...row, teamName: longTeam, buzzedBy: longPerson }]} />);

    expect(screen.getByText(longTeam)).toBeInTheDocument();
    expect(screen.getByText(`Buzzed by ${longPerson}`)).toBeInTheDocument();
  });

  it('renders nothing for an empty queue', () => {
    renderWithApp(<TeamQueue rows={[]} />);

    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });
});
