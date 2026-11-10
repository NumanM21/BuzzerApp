import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeJoinTeams } from '@/test/factories';
import { renderWithApp } from '@/test/renderWithApp';
import { TeamPicker, type TeamPickerOption, type TeamPickerProps } from './TeamPicker';

function makeOptions(count: number): TeamPickerOption[] {
  return makeJoinTeams(count, 2).map((team) => ({ ...team, detail: `${team.memberCount} players` }));
}

function renderPicker(props: Partial<TeamPickerProps> = {}) {
  const onSelect = vi.fn();
  const result = renderWithApp(
    <TeamPicker legend="Your team" options={makeOptions(3)} selectedId={undefined} onSelect={onSelect} {...props} />,
  );
  return { ...result, onSelect };
}

describe('TeamPicker', () => {
  it.each([1, 2, 6, 13])('offers one radio per team for %i teams, in the order given', (count) => {
    renderPicker({ options: makeOptions(count) });

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(count);
    expect(radios[0]).toHaveAccessibleName(/Team 1/);
    expect(radios[count - 1]).toHaveAccessibleName(new RegExp(`Team ${count}\\b`));
  });

  it('is one group with a name, so the arrow keys move between teams', () => {
    renderPicker();

    expect(screen.getByRole('group', { name: 'Your team' })).toBeInTheDocument();
    const names = new Set(screen.getAllByRole('radio').map((radio) => radio.getAttribute('name')));
    expect(names.size).toBe(1);
  });

  it('shows each team\'s name and head count as text', () => {
    renderPicker({ options: [{ id: 5, name: 'Team 5', colorKey: 'a', iconKey: 'b', detail: '1 player' }] });

    expect(screen.getByRole('radio', { name: /Team 5.*1 player/ })).toBeInTheDocument();
  });

  it('checks only the selected team', () => {
    renderPicker({ selectedId: 2 });

    expect(screen.getByRole('radio', { name: /Team 2/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Team 1/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Team 3/ })).not.toBeChecked();
  });

  it('reports the id of the team that is chosen', async () => {
    const { user, onSelect } = renderPicker();

    await user.click(screen.getByRole('radio', { name: /Team 3/ }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('can be chosen by clicking the team\'s name, not only the small radio', async () => {
    const { user, onSelect } = renderPicker();

    await user.click(screen.getByText('Team 2'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('shows the longest team name in full', () => {
    const longName = 'Team Abcdefghijklmnopqrs'.padEnd(24, 'x');
    renderPicker({ options: [{ id: 1, name: longName, colorKey: 'a', iconKey: 'b', detail: '2 players' }] });

    expect(screen.getByText(longName)).toBeInTheDocument();
  });

  it('shows an error as text tied to the group', () => {
    renderPicker({ errorText: 'Pick your team' });

    const group = screen.getByRole('group', { name: 'Your team' });
    expect(screen.getByText('Pick your team')).toBeInTheDocument();
    expect(group).toHaveAccessibleDescription('Pick your team');
  });

  it('shows no error text when there is none', () => {
    renderPicker();

    expect(screen.getByRole('group', { name: 'Your team' })).not.toHaveAttribute('aria-describedby');
  });
});
