import { describe, expect, it } from 'vitest';
import { clientRoundErrors, describeRoundError } from './roundErrors';

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
