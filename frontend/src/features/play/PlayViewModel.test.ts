import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { clientRoundErrors } from '@/domain/roundErrors';
import type { ConnectionState } from '@/realtime/types';
import { deferred } from '@/test/deferred';
import { makeAdminMe, makeMe, makePublicSnapshot, makeTeamQueue, makeTeams } from '@/test/factories';
import { flushPromises } from '@/test/flushPromises';
import { createTestFakes, createTestServices } from '@/test/testServices';
import { PlayViewModel } from './PlayViewModel';

interface SetupOptions {
  me?: Me;
  teamCount?: number;
  /** Start connected (the usual case); false leaves the connection down. */
  connected?: boolean;
}

async function setup({ me = makeMe(), teamCount = 3, connected = true }: SetupOptions = {}) {
  const fakes = createTestFakes();
  fakes.sessionApi.me = me;
  fakes.teamsApi.teams = makeTeams(teamCount);
  const services = createTestServices({}, fakes);
  await services.session.restore();
  const vm = new PlayViewModel(services.round, services.session, services.teams);
  vm.activate();
  await flushPromises();
  if (connected) {
    fakes.connection.setState('connected');
  }
  return { vm, connection: fakes.connection, fakes };
}

/** An open round that has not been buzzed yet. */
function openRound(roundId = 'round-1', version = 1) {
  return makePublicSnapshot({ version, roundId, phase: 'open' });
}

describe('PlayViewModel', () => {
  it('loads the teams when it is activated', async () => {
    const { fakes } = await setup();

    expect(fakes.teamsApi.calls).toEqual(['getTeams']);
  });

  describe('the buzzer state', () => {
    it('is waiting before the first snapshot', async () => {
      const { vm } = await setup();

      expect(vm.state).toBe('waiting');
      expect(vm.canBuzz).toBe(false);
      expect(vm.queue).toEqual([]);
    });

    it('is ready while buzzing is open and the team has not buzzed', async () => {
      const { vm, connection } = await setup();

      connection.emitRoundUpdated(openRound());

      expect(vm.state).toBe('ready');
      expect(vm.queuePosition).toBeUndefined();
      expect(vm.buzzedBy).toBeUndefined();
    });

    it.each([2, 3, 6, 13])('shows the place the server gave a waiting team, among %i teams', async (count) => {
      // The player is on team 1 and waits last, whatever the team ids say.
      const { vm, connection } = await setup({ teamCount: count });
      const order = [...Array.from({ length: count - 1 }, (_, index) => count - index), 1];

      connection.emitRoundUpdated(
        makePublicSnapshot({ roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue(order) }),
      );

      expect(vm.state).toBe('queued');
      expect(vm.queuePosition).toBe(count);
      expect(vm.buzzedBy).toBe('Player 10');
    });

    it('is yourTeamUp when the team is the one answering, with no number on the buzzer', async () => {
      const { vm, connection } = await setup();

      connection.emitRoundUpdated(
        makePublicSnapshot({ roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue([1, 2], (i) => (i === 0 ? 'current' : 'waiting')) }),
      );

      expect(vm.state).toBe('yourTeamUp');
      expect(vm.queuePosition).toBeUndefined();
      expect(vm.buzzedBy).toBe('Player 10');
    });

    it('is out once the team has answered wrong', async () => {
      const { vm, connection } = await setup();

      connection.emitRoundUpdated(
        makePublicSnapshot({ roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue([1, 2], (i) => (i === 0 ? 'passed' : 'current')) }),
      );

      expect(vm.state).toBe('out');
      expect(vm.queuePosition).toBeUndefined();
    });

    it('is waiting again after a reset', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound('r', 1));

      connection.emitRoundUpdated(makePublicSnapshot({ version: 2 }));

      expect(vm.state).toBe('waiting');
    });

    it('is waiting for someone with no team, such as an admin, and never lets them buzz', async () => {
      const { vm, connection } = await setup({ me: makeAdminMe() });

      connection.emitRoundUpdated(openRound());
      void vm.buzz();

      expect(vm.state).toBe('waiting');
      expect(vm.canBuzz).toBe(false);
      expect(connection.calls).not.toContain('buzz');
    });
  });

  describe('canBuzz', () => {
    it.each<[string, ConnectionState, boolean]>([
      ['connected', 'connected', true],
      ['connecting', 'connecting', false],
      ['reconnecting', 'reconnecting', false],
      ['disconnected', 'disconnected', false],
    ])('while %s a ready buzzer can be pressed: %s', async (_, connectionState, expected) => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound());

      connection.setState(connectionState);

      expect(vm.canBuzz).toBe(expected);
    });

    it('is false in every state but ready', async () => {
      const { vm, connection } = await setup();
      const queued = makeTeamQueue([2, 1]);

      for (const snapshot of [
        makePublicSnapshot({ version: 1 }),
        makePublicSnapshot({ version: 2, roundId: 'r', phase: 'locked', teamQueue: queued }),
        makePublicSnapshot({ version: 3, roundId: 'r', phase: 'exhausted', teamQueue: makeTeamQueue([1], () => 'passed') }),
        makePublicSnapshot({ version: 4, roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue([2]) }),
      ]) {
        connection.emitRoundUpdated(snapshot);
        expect(vm.canBuzz).toBe(false);
      }
    });
  });

  describe('buzzing', () => {
    it('sends one buzz, with nothing in it, and says "sent" at once', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound());
      const answer = deferred<{ success: boolean; error: string | null; changed: boolean }>();
      connection.buzz = () => {
        connection.calls.push('buzz');
        return answer.promise;
      };

      const pending = vm.buzz();

      // The server hasn't answered, yet the person already sees the press land.
      expect(vm.isSent).toBe(true);
      expect(vm.canBuzz).toBe(false);
      answer.resolve({ success: true, error: null, changed: true });
      await pending;
      expect(connection.calls.filter((call) => call === 'buzz')).toHaveLength(1);
      expect(vm.isSent).toBe(true);
      expect(vm.error).toBeUndefined();
    });

    it('sends only one buzz however many times it is pressed in the same round', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound());

      const presses = [vm.buzz(), vm.buzz(), vm.buzz()];
      await Promise.all(presses);
      await vm.buzz();

      expect(connection.calls.filter((call) => call === 'buzz')).toHaveLength(1);
    });

    it('does not send while the connection is down', async () => {
      const { vm, connection } = await setup({ connected: false });
      connection.emitRoundUpdated(openRound());

      await vm.buzz();

      expect(connection.calls).not.toContain('buzz');
      expect(vm.isSent).toBe(false);
    });

    it('hands over to the snapshot: once the team is queued, "sent" gives way to the real state', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound('r', 1));
      await vm.buzz();

      connection.emitRoundUpdated(
        makePublicSnapshot({ version: 2, roundId: 'r', phase: 'open', teamQueue: makeTeamQueue([2, 1]) }),
      );

      expect(vm.isSent).toBe(false);
      expect(vm.state).toBe('queued');
      expect(vm.queuePosition).toBe(2);
    });

    it('can buzz again in the next round', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound('round-1', 1));
      await vm.buzz();
      connection.emitRoundUpdated(makePublicSnapshot({ version: 2 }));

      connection.emitRoundUpdated(openRound('round-2', 3));

      expect(vm.isSent).toBe(false);
      expect(vm.canBuzz).toBe(true);
      await vm.buzz();
      expect(connection.calls.filter((call) => call === 'buzz')).toHaveLength(2);
    });

    it.each([clientRoundErrors.failed, 'rejects'])(
      'lets the person try again when the call never reached the game (%s)',
      async (kind) => {
        const { vm, connection } = await setup();
        connection.emitRoundUpdated(openRound());
        connection.answers.buzz =
          kind === 'rejects' ? new Error('connection lost') : { success: false, error: kind, changed: false };

        await vm.buzz();

        expect(vm.canBuzz).toBe(true);
        expect(vm.isSent).toBe(false);
        expect(vm.error).toBe("That didn't reach the game. Try again");
      },
    );

    it('does not repeat a buzz the server turned down', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound());
      connection.answers.buzz = { success: false, error: 'round.unknownPlayer', changed: false };

      await vm.buzz();

      expect(vm.canBuzz).toBe(false);
      expect(vm.isSent).toBe(false);
      expect(vm.error).toBe("You're in from the next round");
    });

    it('clears the old error when the person presses again', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound());
      connection.answers.buzz = new Error('connection lost');
      await vm.buzz();
      connection.answers.buzz = { success: true, error: null, changed: true };

      await vm.buzz();

      expect(vm.error).toBeUndefined();
      expect(vm.isSent).toBe(true);
    });
  });

  describe('the error', () => {
    it.each([
      ['round.notOpen', "Buzzing isn't open right now"],
      ['round.windowClosed', 'Too late: the buzzers have locked'],
      ['round.unknownPlayer', "You're in from the next round"],
      ['round.duplicatePlayer', 'Something went wrong. Try again'],
      [clientRoundErrors.offline, 'Not connected to the game. Wait a moment and try again'],
    ])('says what %s means', async (code, sentence) => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound());
      connection.answers.buzz = { success: false, error: code, changed: false };

      await vm.buzz();

      expect(vm.error).toBe(sentence);
    });

    it('stays after the round locks without the team: that is what the person needs to hear', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound('r', 1));
      connection.answers.buzz = { success: false, error: 'round.windowClosed', changed: true };
      await vm.buzz();

      connection.emitRoundUpdated(
        makePublicSnapshot({ version: 2, roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue([2, 3]) }),
      );

      expect(vm.state).toBe('waiting');
      expect(vm.error).toBe('Too late: the buzzers have locked');
    });

    it('goes away once the team is in the queue, whatever the answer said', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound('r', 1));
      connection.answers.buzz = new Error('connection lost');
      await vm.buzz();

      connection.emitRoundUpdated(
        makePublicSnapshot({ version: 2, roundId: 'r', phase: 'open', teamQueue: makeTeamQueue([1]) }),
      );

      expect(vm.error).toBeUndefined();
    });

    it('does not follow the person into the next round', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound('round-1', 1));
      connection.answers.buzz = { success: false, error: 'round.windowClosed', changed: true };
      await vm.buzz();

      connection.emitRoundUpdated(openRound('round-2', 2));

      expect(vm.error).toBeUndefined();
    });
  });

  describe('the connection notice', () => {
    it.each<[ConnectionState, string | undefined]>([
      ['connected', undefined],
      ['connecting', 'Connecting to the game…'],
      ['reconnecting', 'Connection lost. Reconnecting…'],
      ['disconnected', 'Not connected to the game'],
    ])('while %s says: %s', async (state, notice) => {
      const { vm, connection } = await setup({ connected: false });

      connection.setState(state);

      expect(vm.connectionNotice).toBe(notice);
    });

    it('keeps the last snapshot on screen through a drop', async () => {
      const { vm, connection } = await setup();
      connection.emitRoundUpdated(openRound());

      connection.drop();

      expect(vm.state).toBe('ready');
      expect(vm.canBuzz).toBe(false);
      expect(vm.connectionNotice).toBe('Connection lost. Reconnecting…');
    });
  });

  describe('the queue', () => {
    it.each([1, 2, 6, 13])('has a row for each of %i teams, in the server’s order', async (count) => {
      const { vm, connection } = await setup({ teamCount: count });
      const order = Array.from({ length: count }, (_, index) => count - index);

      connection.emitRoundUpdated(
        makePublicSnapshot({ roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue(order) }),
      );

      expect(vm.queue.map((row) => row.teamId)).toEqual(order);
      expect(vm.queue.map((row) => row.position)).toEqual(order.map((_, index) => index + 1));
    });

    it('marks the player’s team and takes colours and icons from the teams list', async () => {
      const { vm, connection } = await setup({ me: makeMe({ teamId: 2, teamName: 'Team 2' }) });

      connection.emitRoundUpdated(
        makePublicSnapshot({ roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue([3, 2]) }),
      );

      expect(vm.queue).toMatchObject([
        { teamId: 3, isMine: false, colorKey: 'color-3', iconKey: 'icon-3' },
        { teamId: 2, isMine: true, colorKey: 'color-2', iconKey: 'icon-2' },
      ]);
      expect(vm.teamColorKey).toBe('color-2');
    });

    it('shows the names from the snapshot even after a team is renamed', async () => {
      const { vm, connection, fakes } = await setup();
      connection.emitRoundUpdated(
        makePublicSnapshot({ roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue([1]) }),
      );

      fakes.teamsApi.teams = fakes.teamsApi.teams.map((team) => ({ ...team, name: 'Renamed' }));
      connection.emitTeamsChanged();
      await flushPromises();

      expect(vm.queue[0].teamName).toBe('Team 1');
    });

    it('keeps a row, with fallback keys, for a team the teams list does not have', async () => {
      const { vm, connection } = await setup({ teamCount: 2 });

      connection.emitRoundUpdated(
        makePublicSnapshot({ roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue([1, 9]) }),
      );

      expect(vm.queue).toHaveLength(2);
      expect(vm.queue[1]).toMatchObject({ teamId: 9, teamName: 'Team 9', colorKey: '', iconKey: '' });
    });

    it('still shows the queue before the teams have loaded, and the buzzer without a team colour', async () => {
      const fakes = createTestFakes();
      fakes.sessionApi.me = makeMe();
      const services = createTestServices({}, fakes);
      await services.session.restore();
      const vm = new PlayViewModel(services.round, services.session, services.teams);
      fakes.connection.setState('connected');

      fakes.connection.emitRoundUpdated(
        makePublicSnapshot({ roundId: 'r', phase: 'locked', teamQueue: makeTeamQueue([1]) }),
      );

      expect(vm.queue).toHaveLength(1);
      expect(vm.queue[0].colorKey).toBe('');
      expect(vm.teamColorKey).toBeUndefined();
    });
  });
});
