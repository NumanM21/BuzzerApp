import type { RoundPhase } from './round';

/** The three buttons of the host's screen. */
export type HostAction = 'beginRound' | 'nextTeam' | 'resetRound';

/**
 * Which host buttons can work in a phase: Begin only when no question is in play, Next team only while a team is
 * answering (`locked`), Reset whenever there is something to clear. These mirror what the server accepts, so a
 * host is never offered a button that is certain to be refused; the server still has the last word (two hosts may
 * press at once).
 */
export function hostActionsAllowedIn(phase: RoundPhase): Record<HostAction, boolean> {
  return {
    beginRound: phase === 'idle',
    nextTeam: phase === 'locked',
    resetRound: phase !== 'idle',
  };
}

const phaseText: Record<RoundPhase, string> = {
  idle: 'No question in play',
  open: 'Waiting for buzzes',
  locked: 'Locked',
  exhausted: 'Every team has passed',
};

/** The phase in words for the host. */
export function describeRoundPhase(phase: RoundPhase): string {
  return phaseText[phase];
}

/** The parts of a buzz that its line shows (a subset of the hub's `BuzzEntry`, which `domain/` can't import). */
export interface BuzzLineInput {
  sequence: number;
  displayName: string;
  teamName: string;
  /** Milliseconds after the round's first buzz. */
  offsetMs: number;
  countedForTeam: boolean;
}

/**
 * Seconds after the first buzz, two decimals, always with a sign: `+0.00s`, `+0.21s`. Rounds half up in whole
 * hundredths of a second, with integers, so a float such as 1.005 can't round the wrong way. A negative offset (not
 * expected) reads as zero.
 */
export function formatBuzzOffset(offsetMs: number): string {
  const hundredths = Math.max(0, Math.round(offsetMs / 10));
  const whole = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, '0');
  return `+${whole}.${fraction}s`;
}

/**
 * One line of the host's buzz list: `#1 Alice (Team 1) +0.00s`. A teammate's later buzz says so in words
 * (`· not counted`), because it didn't change the queue.
 */
export function formatBuzzLine(buzz: BuzzLineInput): string {
  const line = `#${buzz.sequence} ${buzz.displayName} (${buzz.teamName}) ${formatBuzzOffset(buzz.offsetMs)}`;
  return buzz.countedForTeam ? line : `${line} · not counted`;
}

/**
 * How long a team has been answering, as `m:ss.t` (tenths), for the host's stopwatch: `0:07.4`, `1:05.0`. Below
 * zero (the phone's estimate of the server's clock can be a few milliseconds ahead of a snapshot) reads as zero.
 */
export function formatElapsed(elapsedMs: number): string {
  const tenths = Math.max(0, Math.floor(elapsedMs / 100));
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}
