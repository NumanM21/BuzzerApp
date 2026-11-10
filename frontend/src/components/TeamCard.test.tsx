import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Member } from '@/api/types';
import { TEAM_NAME_MAX_LENGTH } from '@/domain/names';
import defaultPack from '@/theme/packs/default';
import { defaultCopy } from '@/theme/defaultCopy';
import { makeMembers } from '@/test/factories';
import { renderWithApp } from '@/test/renderWithApp';
import { TeamCard, type TeamCardMember } from './TeamCard';

function toCardMember(member: Member): TeamCardMember {
  return { id: member.playerId, displayName: member.displayName, realName: member.realName };
}

describe('TeamCard', () => {
  it.each([1, 2, 6, 13])('lists all %i members', (count) => {
    renderWithApp(<TeamCard name="Team 1" colorKey="c" iconKey="i" members={makeMembers(count).map(toCardMember)} />);

    const card = screen.getByRole('region', { name: 'Team 1' });
    expect(within(card).getAllByRole('listitem')).toHaveLength(count);
  });

  it('says so when the team has no members', () => {
    renderWithApp(<TeamCard name="Team 1" colorKey="c" iconKey="i" members={[]} />);

    expect(screen.getByText(defaultCopy.teamNoMembers)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows a real name under the display name and marks the viewer', () => {
    const members: TeamCardMember[] = [
      { id: 1, displayName: 'Player 1', realName: 'Real Name 1', isViewer: true },
      { id: 2, displayName: 'Player 2' },
    ];
    renderWithApp(<TeamCard name="Team 1" colorKey="c" iconKey="i" members={members} />);

    const [first, second] = screen.getAllByRole('listitem');
    expect(first).toHaveTextContent('Player 1');
    expect(first).toHaveTextContent('Real Name 1');
    expect(first).toHaveTextContent(`(${defaultCopy.teamYou})`);
    expect(second).not.toHaveTextContent(defaultCopy.teamYou);
  });

  it('renders the card and member action slots', () => {
    const members = makeMembers(2).map(toCardMember);
    renderWithApp(
      <TeamCard
        name="Team 1"
        colorKey="c"
        iconKey="i"
        members={members}
        action={<button type="button">Team menu</button>}
        renderMemberAction={(member) => <button type="button">Edit {member.displayName}</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Team menu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Player 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Player 2' })).toBeInTheDocument();
  });

  it('uses the pack colour and icon for known keys and the fallback for unknown ones', () => {
    const [colorKey, color] = Object.entries(defaultPack.teams.colors)[0];
    const [iconKey, iconUrl] = Object.entries(defaultPack.teams.icons)[0];
    const { container } = renderWithApp(
      <>
        <TeamCard name="Known" colorKey={colorKey} iconKey={iconKey} members={[]} />
        <TeamCard name="Unknown" colorKey="not-in-pack" iconKey="not-in-pack" members={[]} />
      </>,
    );

    const [known, unknown] = container.querySelectorAll('section');
    expect(known.style.getPropertyValue('--team-fill')).toBe(color.fill);
    expect(known.querySelector('img')).toHaveAttribute('src', iconUrl);
    expect(unknown.style.getPropertyValue('--team-fill')).toBe(defaultPack.teams.fallback.color.fill);
    expect(unknown.querySelector('img')).toHaveAttribute('src', defaultPack.teams.fallback.icon);
  });

  it('shows the longest allowed team name in full', () => {
    const longName = 'W'.repeat(TEAM_NAME_MAX_LENGTH);
    renderWithApp(<TeamCard name={longName} colorKey="c" iconKey="i" members={[]} />);

    expect(screen.getByRole('heading', { name: longName })).toBeInTheDocument();
  });
});
