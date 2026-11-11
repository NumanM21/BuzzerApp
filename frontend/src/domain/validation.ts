import {
  PERSON_NAME_MAX_LENGTH,
  PERSON_NAME_MIN_LENGTH,
  TEAM_NAME_MAX_LENGTH,
  TEAM_NAME_MIN_LENGTH,
} from './names';

// Mirrors of the server's input rules, so most mistakes never leave the phone. The server stays the authority and
// may still refuse what passes here. Each function returns the message for the person, or `undefined` when fine.
// Messages written here end without a full stop, like a label; the server's own sentences keep theirs.

export const PIN_LENGTH = 4;

export function validateJoinCode(code: string): string | undefined {
  return code.trim() === '' ? 'Enter the join code' : undefined;
}

/** Names are measured after trimming, as the server does. */
export function validatePersonName(name: string): string | undefined {
  const length = name.trim().length;
  return length < PERSON_NAME_MIN_LENGTH || length > PERSON_NAME_MAX_LENGTH
    ? `Use ${PERSON_NAME_MIN_LENGTH} to ${PERSON_NAME_MAX_LENGTH} characters`
    : undefined;
}

/** What the PIN box keeps of what was typed or pasted: ASCII digits only, at most `PIN_LENGTH` of them. */
export function sanitizePin(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH);
}

export function validatePin(pin: string): string | undefined {
  return new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin) ? undefined : `The PIN is exactly ${PIN_LENGTH} digits`;
}

export function validateTeamChoice(teamId: number | undefined): string | undefined {
  return teamId === undefined ? 'Pick your team' : undefined;
}

export type JoinMode = 'register' | 'signIn';

/** The join form's fields, named as the request names them: a server error for `pin` lands on the same field. */
export type JoinField = 'joinCode' | 'realName' | 'displayName' | 'pin' | 'teamId';
export type JoinFieldErrors = Partial<Record<JoinField, string>>;

export interface JoinFormValues {
  joinCode: string;
  realName: string;
  displayName: string;
  pin: string;
  teamId: number | undefined;
}

/** Signing in needs no display name or team, so those are checked only when registering. */
export function validateJoinForm(mode: JoinMode, values: JoinFormValues): JoinFieldErrors {
  const checks: [JoinField, string | undefined][] = [
    ['joinCode', validateJoinCode(values.joinCode)],
    ['realName', validatePersonName(values.realName)],
    ['pin', validatePin(values.pin)],
  ];
  if (mode === 'register') {
    checks.push(['displayName', validatePersonName(values.displayName)], ['teamId', validateTeamChoice(values.teamId)]);
  }

  const errors: JoinFieldErrors = {};
  for (const [field, message] of checks) {
    if (message !== undefined) {
      errors[field] = message;
    }
  }
  return errors;
}

/** Team names are measured after trimming, like person names, with their own limits. */
export function validateTeamName(name: string): string | undefined {
  const length = name.trim().length;
  return length < TEAM_NAME_MIN_LENGTH || length > TEAM_NAME_MAX_LENGTH
    ? `Use ${TEAM_NAME_MIN_LENGTH} to ${TEAM_NAME_MAX_LENGTH} characters`
    : undefined;
}
