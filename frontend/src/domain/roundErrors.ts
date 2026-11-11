/**
 * Codes for a round command that never reached the server's rules. The server's own codes start with `round.`;
 * these start with `client.` so the two can never collide.
 */
export const clientRoundErrors = {
  /** Not connected when the command was given, so it was not sent. */
  offline: 'client.offline',
  /** Sent, but the call failed: the connection dropped on the way, or the server refused the call itself. */
  failed: 'client.failed',
} as const;

/**
 * True when the command never got a ruling from the server (not connected, or the call itself failed), so the same
 * press may simply be tried again. A server answer, even a refusal, is a ruling: it won't change by asking again.
 */
export function isUndeliveredRoundError(code: string | null | undefined): boolean {
  return code === clientRoundErrors.offline || code === clientRoundErrors.failed;
}

const GENERIC = 'Something went wrong. Try again';

// The server's codes (FrontendSteps Appendix A) and the client's, each as a sentence for the person who pressed.
const sentences: Readonly<Record<string, string>> = {
  'round.notIdle': 'A round is already running',
  'round.notOpen': "Buzzing isn't open right now",
  'round.windowClosed': 'Too late: the buzzers have locked',
  'round.unknownPlayer': "You're in from the next round",
  'round.notLocked': 'No team is answering right now',
  'round.emptyRoster': 'No players have joined a team yet',
  // Should never happen (the server says so); the person can only try again.
  'round.duplicatePlayer': GENERIC,
  [clientRoundErrors.offline]: 'Not connected to the game. Wait a moment and try again',
  [clientRoundErrors.failed]: "That didn't reach the game. Try again",
};

/**
 * The sentence for a failed round command's error code, or `undefined` when there was no error. A code this app
 * doesn't know (a newer server) still gets a sentence.
 */
export function describeRoundError(code: string | null | undefined): string | undefined {
  if (code === null || code === undefined) {
    return undefined;
  }
  return Object.hasOwn(sentences, code) ? sentences[code] : GENERIC;
}
