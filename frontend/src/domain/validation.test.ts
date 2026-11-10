import { describe, expect, it } from 'vitest';
import { PERSON_NAME_MAX_LENGTH, PERSON_NAME_MIN_LENGTH } from './names';
import {
  sanitizePin,
  validateJoinCode,
  validateJoinForm,
  validatePersonName,
  validatePin,
  validateTeamChoice,
  type JoinFormValues,
} from './validation';

describe('validateJoinCode', () => {
  it.each(['', '   '])('rejects %j', (code) => {
    expect(validateJoinCode(code)).toBeDefined();
  });

  it('accepts any code with a character in it: the server decides whether it is the right one', () => {
    expect(validateJoinCode(' ab-12 ')).toBeUndefined();
  });
});

describe('validatePersonName', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '        '],
    ['one character', 'a'],
    ['one character with padding', '  a  '],
    ['one over the maximum', 'a'.repeat(PERSON_NAME_MAX_LENGTH + 1)],
  ])('rejects %s', (_, name) => {
    expect(validatePersonName(name)).toBe(`Use ${PERSON_NAME_MIN_LENGTH} to ${PERSON_NAME_MAX_LENGTH} characters`);
  });

  it.each([
    ['the minimum', 'a'.repeat(PERSON_NAME_MIN_LENGTH)],
    ['the maximum', 'a'.repeat(PERSON_NAME_MAX_LENGTH)],
    ['the maximum with padding around it (trimmed first)', ` ${'a'.repeat(PERSON_NAME_MAX_LENGTH)} `],
    ['a name with a space inside', 'Ann Lee'],
  ])('accepts %s', (_, name) => {
    expect(validatePersonName(name)).toBeUndefined();
  });
});

describe('sanitizePin', () => {
  it.each([
    ['1234', '1234'],
    ['12a3-4', '1234'],
    ['  9 8 7 6 ', '9876'],
    ['123456', '1234'],
    ['abc', ''],
    // Digits of other scripts are not ASCII digits, and the server wants `0-9`.
    ['١٢٣٤', ''],
  ])('keeps the digits of %j: %j', (raw, expected) => {
    expect(sanitizePin(raw)).toBe(expected);
  });
});

describe('validatePin', () => {
  it.each(['0000', '1234', '9999'])('accepts %s', (pin) => {
    expect(validatePin(pin)).toBeUndefined();
  });

  it.each(['', '123', '12345', '12a4', ' 123', '١٢٣٤'])('rejects %j', (pin) => {
    expect(validatePin(pin)).toBeDefined();
  });
});

describe('validateTeamChoice', () => {
  it('asks for a team when none is chosen', () => {
    expect(validateTeamChoice(undefined)).toBeDefined();
  });

  it('accepts a team, even one with id 0', () => {
    expect(validateTeamChoice(0)).toBeUndefined();
    expect(validateTeamChoice(7)).toBeUndefined();
  });
});

describe('validateJoinForm', () => {
  const valid: JoinFormValues = { joinCode: 'CODE', realName: 'Real Name', displayName: 'Nick', pin: '1234', teamId: 3 };
  const empty: JoinFormValues = { joinCode: '', realName: '', displayName: '', pin: '', teamId: undefined };

  it('passes a complete form in both modes', () => {
    expect(validateJoinForm('register', valid)).toEqual({});
    expect(validateJoinForm('signIn', valid)).toEqual({});
  });

  it('reports every field of an empty registration', () => {
    expect(Object.keys(validateJoinForm('register', empty)).sort()).toEqual(
      ['displayName', 'joinCode', 'pin', 'realName', 'teamId'],
    );
  });

  it('asks a signing-in person for the code, name and PIN only', () => {
    expect(Object.keys(validateJoinForm('signIn', empty)).sort()).toEqual(['joinCode', 'pin', 'realName']);
  });
});
