import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundPhase } from '@/domain/round';
import { clientRoundErrors } from '@/domain/roundErrors';
import type { RoundResult } from '@/realtime/types';
import { deferred } from '@/test/deferred';
import { makeAdminMe, makeAdminSnapshot, makeBuzzes, makeTeamQueue, makeTeams } from '@/test/factories';
import { flushPromises } from '@/test/flushPromises';
import { createTestFakes, createTestServices } from '@/test/testServices';
import { HostViewModel } from './HostViewModel';

const NOW = '2030-01-01T20:00:00.000Z';

interface SetupOptions {
  teamCount?: number;
  connected?: boolean;
}

async function setup({ teamCount = 3, connected = true }: SetupOptions = {}) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = makeAdminMe();
  fakes.teamsApi.teams = makeTeams(teamCount);
  const services = createTestServices({}, fakes);
  await services.session.restore();
  const vm = new HostViewModel(services.round, services.clock, services.teams);
  vm.activate();
  await flushPromises();
  if (connected) {
    fakes.connection.setState('connected');
  }
  return { vm, connection: fakes.connection, fakes, clock: services.clock };
}

function snapshot(phase: RoundPhase, version = 1, teamIds: readonly number[] = []) {
  return makeAdminSnapshot({
    version,
    phase,
    roundId: phase === 'idle' ? null : 'round-1',
    teamQueue: makeTeamQueue(teamIds, (index) => (phase === 'locked' && index === 0 ? 'current' : 'waiting')),
    serverNow: NOW,
  });
}

function enabledActions(vm: HostViewModel): string[] {
  return vm.buttons.filter((button) => button.enabled).map((button) => button.action);
}

// The stopwatch reads the phone's clock, which fake timers control.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HostViewModel', () => {
  it('loads the teams when it is activated', async () => {
    const { fakes } = await setup();

    expect(fakes.teamsApi.calls).toEqual(['getTeams']);
  });

  describe('before the first admin snapshot', () => {
    it('says it is connecting and offers no button', async () => {
      const { vm } = await setup({ connected: false });

      expect(vm.isConnecting).toBe(true);
      expect(vm.phaseText).toBeUndefined();
      expect(vm.connectionNotice).toBe('Not connected to the game');
      expect(vm.queue).toEqual([]);
      expect(vm.buzzes).toEqual([]);
      expect(enabledActions(vm)).toEqual([]);
    });

    it("stays that way when only the public snapshot has arrived (a promoted admin's connection restarts)", async () => {
      const { vm, connection } = await setup();

      connection.emitRoundUpdated(snapshot('open'));

      expect(vm.isConnecting).toBe(true);
      expect(enabledActions(vm)).toEqual([]);
    });
  });

  describe('which buttons are enabled', () => {
    it.each<[RoundPhase, string[]]>([
      ['idle', ['beginRound']],
      ['open', ['resetRound']],
      ['locked', ['nextTeam', 'resetRound']],
      ['exhausted', ['resetRound']],
    ])('in %s', async (phase, expected) => {
      const { vm, connection } = await setup();

      connection.emitAdminRoundUpdated(snapshot(phase, 1, phase === 'idle' || phase === 'open' ? [] : [2, 1]));

      expect(vm.isConnecting).toBe(false);
      expect(enabledActions(vm)).toEqual(expected);
    });

    it('lists them in the order Begin, Next team, Reset', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot('idle'));

      expect(vm.buttons.map((button) => button.label)).toEqual(['Begin', 'Next team', 'Reset']);
    });

    it('disables all of them while the connection is down, keeping the last snapshot on screen', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot('locked', 1, [2, 1]));

      connection.drop();

      expect(enabledActions(vm)).toEqual([]);
      expect(vm.connectionNotice).toBe('Connection lost. Reconnecting…');
      expect(vm.queue).toHaveLength(2);
    });
  });

  describe('running a command', () => {
    it.each([
      ['beginRound', 'idle'],
      ['nextTeam', 'locked'],
      ['resetRound', 'open'],
    ] as const)('%s calls the hub with no arguments', async (action, phase) => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot(phase, 1, phase === 'locked' ? [2, 1] : []));

      await vm.run(action);

      expect(connection.calls).toContain(action);
    });

    it('does not send a command its button forbids', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot('idle'));

      await vm.run('nextTeam');
      await vm.run('resetRound');

      expect(connection.calls.filter((call) => call !== 'start')).toEqual([]);
    });

    it('disables every button while a call is in flight and ignores a double tap', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot('open'));
      const answer = deferred<RoundResult>();
      connection.resetRound = () => {
        connection.calls.push('resetRound');
        return answer.promise;
      };

      const first = vm.run('resetRound');
      const second = vm.run('resetRound');

      expect(vm.isSending).toBe(true);
      expect(enabledActions(vm)).toEqual([]);
      answer.resolve({ success: true, error: null, changed: true });
      await Promise.all([first, second]);
      expect(connection.calls.filter((call) => call === 'resetRound')).toHaveLength(1);
      expect(vm.isSending).toBe(false);
      expect(enabledActions(vm)).toEqual(['resetRound']);
    });

    it.each([
      ['round.emptyRoster', 'No players have joined a team yet'],
      ['round.notIdle', 'A round is already running'],
      ['round.notLocked', 'No team is answering right now'],
      [clientRoundErrors.offline, 'Not connected to the game. Wait a moment and try again'],
      [clientRoundErrors.failed, "That didn't reach the game. Try again"],
      ['round.somethingNew', 'Something went wrong. Try again'],
    ])('shows the sentence for %s', async (code, sentence) => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot('idle'));
      connection.answers.beginRound = { success: false, error: code, changed: false };

      await vm.run('beginRound');

      expect(vm.error).toBe(sentence);
    });

    it('shows nothing when the call worked', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot('idle'));

      await vm.run('beginRound');

      expect(vm.error).toBeUndefined();
    });

    it("turns a call that rejects into the 'didn't reach the game' sentence", async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot('idle'));
      connection.answers.beginRound = new Error('connection closed');

      await vm.run('beginRound');

      expect(vm.error).toBe("That didn't reach the game. Try again");
    });

    it('drops the sentence as soon as the round changes phase (another host got there first)', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot('idle'));
      connection.answers.beginRound = { success: false, error: 'round.notIdle', changed: false };
      await vm.run('beginRound');
      expect(vm.error).toBe('A round is already running');

      connection.emitAdminRoundUpdated(snapshot('open', 2));

      expect(vm.error).toBeUndefined();
    });

    it('drops the sentence when the next command starts', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(snapshot('idle'));
      connection.answers.beginRound = { success: false, error: 'round.emptyRoster', changed: false };
      await vm.run('beginRound');
      connection.answers.beginRound = { success: true, error: null, changed: true };

      await vm.run('beginRound');

      expect(vm.error).toBeUndefined();
    });
  });

  describe('what the snapshot shows', () => {
    it.each<[RoundPhase, string]>([
      ['idle', 'No question in play'],
      ['open', 'Waiting for buzzes'],
      ['locked', 'Locked'],
      ['exhausted', 'Every team has passed'],
    ])('puts the %s phase in words', async (phase, text) => {
      const { vm, connection } = await setup();

      connection.emitAdminRoundUpdated(snapshot(phase));

      expect(vm.phaseText).toBe(text);
    });

    it.each([1, 2, 6, 13])('lists the queue of %i teams in the order the server sent', async (teamCount) => {
      const { vm, connection } = await setup({ teamCount });
      // In the opposite order to the team numbers, to catch a screen that sorts.
      const ids = Array.from({ length: teamCount }, (_, index) => teamCount - index);

      connection.emitAdminRoundUpdated(snapshot('open', 1, ids));

      expect(vm.queue.map((row) => row.teamId)).toEqual(ids);
      expect(vm.queue.map((row) => row.position)).toEqual(ids.map((_, index) => index + 1));
    });

    it('gives a queued team its colour and icon from the teams list, and a fallback when the list lacks it', async () => {
      const { vm, connection } = await setup({ teamCount: 2 });

      connection.emitAdminRoundUpdated(snapshot('open', 1, [2, 9]));

      expect(vm.queue[0]).toMatchObject({ teamId: 2, colorKey: 'color-2', iconKey: 'icon-2', isMine: false });
      expect(vm.queue[1]).toMatchObject({ teamId: 9, colorKey: '', iconKey: '' });
    });

    it('lists every buzz in arrival order, with a teammate’s later buzz marked as not counted', async () => {
      const { vm, connection } = await setup();
      const queue = makeTeamQueue([2, 1]);
      connection.emitAdminRoundUpdated(
        makeAdminSnapshot({
          version: 1,
          phase: 'open',
          roundId: 'r',
          teamQueue: queue,
          buzzes: [
            ...makeBuzzes(queue),
            { sequence: 3, playerId: 21, displayName: 'Player 21', teamId: 2, teamName: 'Team 2', offsetMs: 210, countedForTeam: false },
          ],
        }),
      );

      expect(vm.buzzes).toEqual([
        { sequence: 1, text: '#1 Player 20 (Team 2) +0.00s', counted: true },
        { sequence: 2, text: '#2 Player 10 (Team 1) +0.10s', counted: true },
        { sequence: 3, text: '#3 Player 21 (Team 2) +0.21s · not counted', counted: false },
      ]);
    });
  });

  describe('the stopwatch', () => {
    function lockedSince(currentSince: string | null, version = 1) {
      return makeAdminSnapshot({
        version,
        phase: 'locked',
        roundId: 'r',
        teamQueue: makeTeamQueue([2, 1], (index) => (index === 0 ? 'current' : 'waiting')),
        currentTeamId: 2,
        currentSince,
        serverNow: NOW,
      });
    }

    it('shows nothing while no team is answering', async () => {
      const { vm, connection } = await setup();

      connection.emitAdminRoundUpdated(snapshot('open', 1, [2]));

      expect(vm.answering).toBeUndefined();
    });

    it('counts from the moment the team became current, by the server’s clock', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(lockedSince('2030-01-01T19:59:53.000Z'));

      vi.advanceTimersByTime(500);

      expect(vm.answering).toEqual({ teamName: 'Team 2', buzzedBy: 'Player 20', elapsed: '0:07.5' });
    });

    it('ticks as time passes, with no new snapshot', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(lockedSince(NOW));

      expect(vm.answering?.elapsed).toBe('0:00.0');
      vi.advanceTimersByTime(65_000);

      expect(vm.answering?.elapsed).toBe('1:05.0');
    });

    it('uses the server’s clock, not the phone’s, when the two differ', async () => {
      const { vm, connection } = await setup();
      // The phone says 20:00:00; the server's snapshot says it is 20:10:00 there. The turn began there at 20:09:50.
      connection.emitAdminRoundUpdated(
        makeAdminSnapshot({
          version: 1,
          phase: 'locked',
          roundId: 'r',
          teamQueue: makeTeamQueue([2], () => 'current'),
          currentSince: '2030-01-01T20:09:50.000Z',
          serverNow: '2030-01-01T20:10:00.000Z',
        }),
      );

      vi.advanceTimersByTime(200);

      expect(vm.answering?.elapsed).toBe('0:10.2');
    });

    it('never goes below zero', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(lockedSince('2030-01-01T20:00:05.000Z'));

      expect(vm.answering?.elapsed).toBe('0:00.0');
    });

    it('starts again from zero when the next team becomes current', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(lockedSince('2030-01-01T19:59:00.000Z'));
      vi.advanceTimersByTime(1_000);
      expect(vm.answering?.elapsed).toBe('1:01.0');

      connection.emitAdminRoundUpdated(
        makeAdminSnapshot({
          version: 2,
          phase: 'locked',
          roundId: 'r',
          teamQueue: makeTeamQueue([2, 1], (index) => (index === 0 ? 'passed' : 'current')),
          currentSince: '2030-01-01T20:00:01.000Z',
          serverNow: '2030-01-01T20:00:01.000Z',
        }),
      );
      vi.advanceTimersByTime(300);

      expect(vm.answering).toEqual({ teamName: 'Team 1', buzzedBy: 'Player 10', elapsed: '0:00.3' });
    });

    it('stops ticking when disposed', async () => {
      const { vm, connection } = await setup();
      connection.emitAdminRoundUpdated(lockedSince(NOW));
      vi.advanceTimersByTime(1_000);
      expect(vm.answering?.elapsed).toBe('0:01.0');

      vm.dispose();
      vi.advanceTimersByTime(5_000);

      expect(vm.answering?.elapsed).toBe('0:01.0');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('leaves exactly one timer however often it is activated (StrictMode runs activate twice)', async () => {
      const { vm } = await setup();

      vm.activate();
      vm.activate();

      expect(vi.getTimerCount()).toBe(1);
      vm.dispose();
      vm.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
