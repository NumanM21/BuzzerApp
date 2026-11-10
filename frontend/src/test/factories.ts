import type { Member, Team } from '@/api/types';

// Test data with neutral names ("Team 1", "Player 7") and as many teams or players as a test asks for. Tests never
// use a real year's teams: the count, names, colours and icons change every year.

export function makeMembers(count: number, firstPlayerId = 1): Member[] {
  return Array.from({ length: count }, (_, index) => {
    const playerId = firstPlayerId + index;
    return { playerId, displayName: `Player ${playerId}`, realName: null };
  });
}

interface MakeTeamsOptions {
  membersPerTeam?: number;
}

/**
 * `count` teams in display order. Colour and icon keys are neutral (`color-1`, `icon-1`) and belong to no pack, so
 * a component under test shows the pack's fallback for them, which is what an unknown key must do.
 */
export function makeTeams(count: number, { membersPerTeam = 0 }: MakeTeamsOptions = {}): Team[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return {
      id,
      name: `Team ${id}`,
      colorKey: `color-${id}`,
      iconKey: `icon-${id}`,
      sortOrder: id,
      members: makeMembers(membersPerTeam, index * membersPerTeam + 1),
    };
  });
}
