import { describe, expect, it } from 'vitest';
import { makePublicSnapshot, makeTeamQueue } from '@/test/factories';
import { getBuzzerState } from './buzzerState';
import type { RoundPhase, TeamTurnStatus } from './round';

// Team ids in buzz order unlike their numbers (13, 12, … 1), so a rule that confused a team's id with its place in
// the queue would fail.
function idsInBuzzOrder(teamCount: number): number[] {
  return Array.from({ length: teamCount }, (_, index) => teamCount - index);
}

const teamCounts = [1, 2, 6, 13];

describe('getBuzzerState', () => {
  describe('waiting', () => {
    it('without a snapshot', () => {
      expect(getBuzzerState(undefined, 1)).toEqual({ state: 'waiting' });
    });

    it('while the round is idle', () => {
      expect(getBuzzerState(makePublicSnapshot({ phase: 'idle' }), 1)).toEqual({ state: 'waiting' });
    });

    it.each([null, undefined])('without a team (%s), whatever the round', (teamId) => {
      const open = makePublicSnapshot({ phase: 'open', teamQueue: makeTeamQueue([1, 2]) });

      expect(getBuzzerState(open, teamId)).toEqual({ state: 'waiting' });
    });

    it.each<RoundPhase>(['locked', 'exhausted'])('when the round is %s and my team is not in the queue', (phase) => {
      const snapshot = makePublicSnapshot({ phase, teamQueue: makeTeamQueue([2, 3], () => 'passed') });

      expect(getBuzzerState(snapshot, 1)).toEqual({ state: 'waiting' });
    });
  });

  describe('ready', () => {
    it.each(teamCounts)('while open and my team has not buzzed (%i teams, the others all in the queue)', (count) => {
      const others = idsInBuzzOrder(count).filter((id) => id !== 1);
      const snapshot = makePublicSnapshot({ phase: 'open', teamQueue: makeTeamQueue(others) });

      expect(getBuzzerState(snapshot, 1)).toEqual({ state: 'ready' });
    });

    it('while open with an empty queue', () => {
      expect(getBuzzerState(makePublicSnapshot({ phase: 'open' }), 1)).toEqual({ state: 'ready' });
    });
  });

  describe('my team in the queue', () => {
    // Every team count, every place in the queue, the round in the phases where that status can occur.
    const cases = teamCounts.flatMap((count) =>
      idsInBuzzOrder(count).map((myTeamId, index) => ({ count, myTeamId, position: index + 1 })),
    );

    it.each(cases)('$count teams, my team at #$position: queued while open or locked', ({ count, myTeamId, position }) => {
      for (const phase of ['open', 'locked'] as const) {
        const snapshot = makePublicSnapshot({ phase, teamQueue: makeTeamQueue(idsInBuzzOrder(count)) });

        expect(getBuzzerState(snapshot, myTeamId)).toEqual({
          state: 'queued',
          position,
          buzzedBy: `Player ${myTeamId * 10}`,
        });
      }
    });

    it.each(cases)('$count teams, my team at #$position: up when current', ({ count, myTeamId, position }) => {
      const statusAt = (index: number): TeamTurnStatus =>
        index < position - 1 ? 'passed' : index === position - 1 ? 'current' : 'waiting';
      const snapshot = makePublicSnapshot({ phase: 'locked', teamQueue: makeTeamQueue(idsInBuzzOrder(count), statusAt) });

      expect(getBuzzerState(snapshot, myTeamId)).toEqual({
        state: 'yourTeamUp',
        position,
        buzzedBy: `Player ${myTeamId * 10}`,
      });
    });

    it.each(cases)('$count teams, my team at #$position: out once passed', ({ count, myTeamId, position }) => {
      for (const phase of ['locked', 'exhausted'] as const) {
        const snapshot = makePublicSnapshot({ phase, teamQueue: makeTeamQueue(idsInBuzzOrder(count), () => 'passed') });

        expect(getBuzzerState(snapshot, myTeamId)).toMatchObject({ state: 'out', position });
      }
    });

    it('takes the position the server sent, not the place in the list', () => {
      const queue = makeTeamQueue([5, 6]).map((entry) => ({ ...entry, position: entry.position + 10 }));

      expect(getBuzzerState(makePublicSnapshot({ phase: 'open', teamQueue: queue }), 6)).toMatchObject({ position: 12 });
    });
  });
});
