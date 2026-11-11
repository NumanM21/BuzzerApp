import { describe, expect, it } from 'vitest';
import { clientRoundErrors, describeRoundError, isUndeliveredRoundError } from './roundErrors';

describe('isUndeliveredRoundError', () => {
  it.each([clientRoundErrors.offline, clientRoundErrors.failed])('%s may be tried again', (code) => {
    expect(isUndeliveredRoundError(code)).toBe(true);
  });

  it.each(['round.notOpen', 'round.windowClosed', 'round.unknownPlayer', 'round.duplicatePlayer', null, undefined])(
    'a server ruling (%s) may not',
    (code) => {
      expect(isUndeliveredRoundError(code)).toBe(false);
    },
  );
});

describe('describeRoundError', () => {
  it.each([
    ['round.notIdle', 'A round is already running'],
    ['round.notOpen', "Buzzing isn't open right now"],
    ['round.windowClosed', 'Too late: the buzzers have locked'],
    ['round.unknownPlayer', "You're in from the next round"],
    ['round.notLocked', 'No team is answering right now'],
    ['round.emptyRoster', 'No players have joined a team yet'],
    ['round.duplicatePlayer', 'Something went wrong. Try again'],
    [clientRoundErrors.offline, 'Not connected to the game. Wait a moment and try again'],
    [clientRoundErrors.failed, "That didn't reach the game. Try again"],
  ])('%s → "%s"', (code, sentence) => {
    expect(describeRoundError(code)).toBe(sentence);
  });

  it('still gives a sentence for a code this app does not know', () => {
    expect(describeRoundError('round.somethingNew')).toBe('Something went wrong. Try again');
  });

  it("doesn't mistake an object's built-in names for codes", () => {
    expect(describeRoundError('toString')).toBe('Something went wrong. Try again');
  });

  it.each([null, undefined])('is undefined when there is no error (%s)', (code) => {
    expect(describeRoundError(code)).toBeUndefined();
  });
});
