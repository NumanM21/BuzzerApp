import { makeAutoObservable } from 'mobx';
import { getBuzzerState } from '@/domain/buzzerState';
import { describeRoundError } from '@/domain/roundErrors';
import { Command } from '@/mvvm/Command';
import type { RoundResult } from '@/realtime/types';
import type { RoundStore } from '@/stores/RoundStore';
import type { ServerClock } from '@/stores/ServerClock';
import type { SessionStore } from '@/stores/SessionStore';

/** The round commands this page offers. */
export type RoundAction = 'beginRound' | 'nextTeam' | 'resetRound' | 'buzz';

export interface RoundActionButton {
  action: RoundAction;
  label: string;
}

const labels: Record<RoundAction, string> = {
  beginRound: 'Begin',
  nextTeam: 'Next team',
  resetRound: 'Reset',
  buzz: 'Buzz',
};

const hostActions: readonly RoundActionButton[] = (['beginRound', 'nextTeam', 'resetRound'] as const).map(
  (action) => ({ action, label: labels[action] }),
);
const playerActions: readonly RoundActionButton[] = [{ action: 'buzz', label: labels.buzz }];

/**
 * The dev-only `/dev/realtime` page: everything the live connection knows, as plain text, and the round's commands,
 * so the connection can be checked against the real server before the play and host screens exist. Dev only, so
 * the snapshots are shown raw (the admin one includes every buzz).
 */
export class RealtimeDebugViewModel {
  /** What the last command answered, in words. */
  lastResult: string | undefined = undefined;

  private readonly round: RoundStore;
  private readonly session: SessionStore;
  private readonly clock: ServerClock;
  private readonly command: Command<[RoundAction]>;

  constructor(round: RoundStore, session: SessionStore, clock: ServerClock) {
    this.round = round;
    this.session = session;
    this.clock = clock;
    this.command = new Command((action: RoundAction) => this.send(action));
    makeAutoObservable<RealtimeDebugViewModel, 'round' | 'session' | 'clock' | 'command'>(
      this,
      { round: false, session: false, clock: false, command: false },
      { autoBind: true },
    );
  }

  get connectionState(): string {
    return this.round.connectionState;
  }

  /** Who the connection belongs to, e.g. "Player 1 (player, Team 1)". */
  get identity(): string {
    const me = this.session.me;
    if (me === undefined) {
      return 'Not signed in';
    }
    return me.teamName === null ? `${me.displayName} (${me.role})` : `${me.displayName} (${me.role}, ${me.teamName})`;
  }

  /** The buzzer as `getBuzzerState` sees it for this person, e.g. "queued, #2, buzzed by Player 3". */
  get buzzer(): string {
    const status = getBuzzerState(this.round.publicSnapshot, this.session.me?.teamId);
    const parts: string[] = [status.state];
    if (status.position !== undefined) {
      parts.push(`#${status.position}`);
    }
    if (status.buzzedBy !== undefined) {
      parts.push(`buzzed by ${status.buzzedBy}`);
    }
    return parts.join(', ');
  }

  get clockOffset(): string {
    return `${this.clock.offsetMs} ms`;
  }

  get publicSnapshot(): string {
    return asText(this.round.publicSnapshot);
  }

  get adminSnapshot(): string {
    return asText(this.round.adminSnapshot);
  }

  /** The host's three commands for an admin, the buzzer for a player. */
  get actions(): readonly RoundActionButton[] {
    return this.session.isAdmin ? hostActions : playerActions;
  }

  get isSending(): boolean {
    return this.command.isRunning;
  }

  async run(action: RoundAction): Promise<void> {
    await this.command.run(action);
  }

  private async send(action: RoundAction): Promise<void> {
    const result = await this.round[action]();
    this.setLastResult(action, result);
  }

  private setLastResult(action: RoundAction, result: RoundResult): void {
    const outcome = result.success ? 'done' : `${describeRoundError(result.error)} (${result.error})`;
    this.lastResult = `${labels[action]}: ${outcome}${result.changed ? ', round changed' : ''}`;
  }
}

function asText(snapshot: object | undefined): string {
  return snapshot === undefined ? 'None yet' : JSON.stringify(snapshot, null, 2);
}
