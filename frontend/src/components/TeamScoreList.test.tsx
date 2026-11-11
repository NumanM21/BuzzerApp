import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TEAM_NAME_MAX_LENGTH } from '@/domain/names';
import { buildTeamScoreRows } from '@/domain/scoreRows';
import { makeTeamScores } from '@/test/factories';
import { renderWithApp } from '@/test/renderWithApp';
import { defaultCopy } from '@/theme/defaultCopy';
import { TeamScoreList } from './TeamScoreList';

describe('TeamScoreList', () => {
  it.each([1, 2, 6, 13])('lists %i teams in the order given, with rank and total', (count) => {
    renderWithApp(<TeamScoreList rows={buildTeamScoreRows(makeTeamScores(count), undefined)} />);

    const items = screen.getAllByRole('listitem');

    expect(items).toHaveLength(count);
    items.forEach((item, index) => {
      expect(item).toHaveTextContent(`Team ${index + 1}`);
      expect(item).toHaveTextContent(String((count - index) * 10));
    });
  });

  it('shows a shared rank twice', () => {
    const scores = [
      { ...makeTeamScores(3)[0], rank: 1 },
      { ...makeTeamScores(3)[1], rank: 1 },
      { ...makeTeamScores(3)[2], rank: 3 },
    ];
    renderWithApp(<TeamScoreList rows={buildTeamScoreRows(scores, undefined)} />);

    const ranks = screen.getAllByRole('listitem').map((item) => item.firstElementChild?.textContent);

    expect(ranks).toEqual(['1', '1', '3']);
  });

  it('marks the viewer\'s team with words', () => {
    renderWithApp(<TeamScoreList rows={buildTeamScoreRows(makeTeamScores(3), 2)} />);

    const [first, second] = screen.getAllByRole('listitem');

    expect(first).not.toHaveTextContent(`(${defaultCopy.teamYou})`);
    expect(second).toHaveTextContent(`Team 2 (${defaultCopy.teamYou})`);
  });

  it('shows a negative total with its sign', () => {
    const scores = [{ ...makeTeamScores(1)[0], total: -50 }];
    renderWithApp(<TeamScoreList rows={buildTeamScoreRows(scores, undefined)} />);

    expect(screen.getByRole('listitem')).toHaveTextContent('-50');
  });

  it('draws the longest team name and a team the pack does not know', () => {
    const name = 'x'.repeat(TEAM_NAME_MAX_LENGTH);
    const scores = [{ ...makeTeamScores(1)[0], name, colorKey: '', iconKey: '' }];
    renderWithApp(<TeamScoreList rows={buildTeamScoreRows(scores, undefined)} />);

    expect(screen.getByText(name)).toBeInTheDocument();
  });
});
