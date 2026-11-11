import { makeAutoObservable, observableRef, runInAction } from 'mobx';
import { connectionNoticeFor } from '@/domain/connectionNotice';
import {
  describeRoundPhase,
  formatBuzzLine,
  formatElapsed,
  hostActionsAllowedIn,
  type HostAction,
} from '@/domain/hostRound';
import { buildQueueRows, teamLooksById, type QueueRow, type TeamLook } from '@/domain/queueRows';
import type { RoundPhase } from '@/domain/round';
import { describeRoundError } from '@/domain/roundErrors';
import { Command } from '@/mvvm/Command';
import type { AdminRoundSnapshot } from '@/realtime/types';
import type { RoundStore } from '@/stores/RoundStore';
import type { ServerClock } from '@/stores/ServerClock';
import type { TeamsStore } from '@/stores/TeamsStore';

/** How often the stopwatch is redrawn. It shows tenths of a second, so it has to tick faster than that. */
const TICK_MS = 100;

const buttonLabels: Record<HostAction, string> = {
  beginRound: 'Begin',
  nextTeam: 'Next team',
  resetRound: 'Reset',
};
const buttonOrder: readonly HostAction[] = ['beginRound', 'nextTeam', 'resetRound'];

export interface HostButton {
  action: HostAction;
  label: string;
  enabled: boolean;
}

/** One line of the buzz list. `text` already says "not counted" where it applies; `counted` is for the look. */
export interface BuzzLineModel {
  sequence: number;
  text: string;
  counted: boolean;
}

/** The team whose turn it is, and for how long. */
export interface AnsweringModel {
  teamName: string;
  buzzedBy: string;
  /** `m:ss.t` since the turn began, by the server's clock. */
  elapsed: string;
}

/** A refused or failed command, tied to the phase it was shown in. */
interface CommandFailure {
  message: string;
  phase: RoundPhase;
}

/**
 * The host's screen: Begin, Next team and Reset, the team queue, the stopwatch for the answering team and every
 * individual buzz. All of it is read from the admin snapshot, never kept here: a host's buttons and lists are a
 * picture of what the server said last, and the next snapshot replaces it.
 *
 * **One command at a time.** The three buttons share one `Command`, so while any call is in flight all three are
 * disabled and a double tap can't send twice (Reset in particular must not fire twice).
 *
 * **Two hosts.** When two hosts press at once the server refuses the second. Its sentence is shown quietly and goes
 * away as soon as the phase changes; the snapshot, not the answer, decides what the screen shows.
 */
export class HostViewModel {
  /** The server's time as of the last tick: what makes the stopwatch move (the clock itself isn't observable). */
  private nowMs: number;
  private failure: CommandFailure | undefined = undefined;
  private timer: ReturnType<typeof setInterval> | undefined = undefined;

  private readonly round: RoundStore;
  private readonly clock: ServerClock;
  private readonly teams: TeamsStore;
  private readonly command: Command<[HostAction]>;

  constructor(round: RoundStore, clock: ServerClock, teams: TeamsStore) {
    this.round = round;
    this.clock = clock;
    this.teams = teams;
    this.nowMs = clock.now();
    this.command = new Command((action: HostAction) => this.send(action));
    makeAutoObservable<HostViewModel, 'round' | 'clock' | 'teams' | 'command' | 'timer' | 'failure'>(
      this,
      { round: false, clock: false, teams: false, command: false, timer: false, failure: observableRef },
      { autoBind: true },
    );
  }

  /** Loads the teams (their colours and icons) and starts the stopwatch. Safe to call again before `dispose`. */
  activate(): void {
    void this.teams.teams.ensureLoaded();
    this.stopTimer();
    this.tick();
    this.timer = setInterval(this.tick, TICK_MS);
  }

  dispose(): void {
    this.stopTimer();
  }

  /**
   * True until the first admin snapshot of this connection has arrived (and after a promotion, until the restarted
   * connection delivers one). Showing an empty queue then would read as "nothing has happened".
   */
  get isConnecting(): boolean {
    return this.snapshot === undefined;
  }

  /** Why what is on screen may be out of date, when the connection isn't up. */
  get connectionNotice(): string | undefined {
    return connectionNoticeFor(this.round.connectionState);
  }

  get phaseText(): string | undefined {
    return this.snapshot === undefined ? undefined : describeRoundPhase(this.snapshot.phase);
  }

  get buttons(): HostButton[] {
    const allowed = this.snapshot === undefined ? undefined : hostActionsAllowedIn(this.snapshot.phase);
    const canSend = allowed !== undefined && this.round.isConnected && !this.command.isRunning;
    return buttonOrder.map((action) => ({
      action,
      label: buttonLabels[action],
      enabled: canSend && allowed[action],
    }));
  }

  /** True while a command is on its way, for the view to mark the buttons busy. */
  get isSending(): boolean {
    return this.command.isRunning;
  }

  /** The server's sentence for the last command that failed, until the phase changes or the next command. */
  get error(): string | undefined {
    const failure = this.failure;
    return failure !== undefined && failure.phase === this.snapshot?.phase ? failure.message : undefined;
  }

  /** The team queue in buzz order, as the server sent it. */
  get queue(): QueueRow[] {
    return buildQueueRows(this.snapshot?.teamQueue ?? [], undefined, this.teamLooks);
  }

  /** The team that is answering now, with the stopwatch. Nothing while no team is. */
  get answering(): AnsweringModel | undefined {
    const snapshot = this.snapshot;
    const current = snapshot?.teamQueue.find((entry) => entry.status === 'current');
    if (snapshot === undefined || current === undefined || snapshot.currentSince === null) {
      return undefined;
    }
    const since = Date.parse(snapshot.currentSince);
    if (Number.isNaN(since)) {
      return undefined;
    }
    return {
      teamName: current.teamName,
      buzzedBy: current.buzzedByDisplayName,
      elapsed: formatElapsed(this.nowMs - since),
    };
  }

  /** Every individual buzz in arrival order, teammates' later ones included. */
  get buzzes(): BuzzLineModel[] {
    return (this.snapshot?.buzzes ?? []).map((buzz) => ({
      sequence: buzz.sequence,
      text: formatBuzzLine(buzz),
      counted: buzz.countedForTeam,
    }));
  }

  /** Ignored unless the button is enabled right now, so a stale tap (or a test) can't send what the screen forbids. */
  async run(action: HostAction): Promise<void> {
    const button = this.buttons.find((candidate) => candidate.action === action);
    if (button?.enabled !== true) {
      return;
    }
    await this.command.run(action);
  }

  private get snapshot(): AdminRoundSnapshot | undefined {
    return this.round.adminSnapshot;
  }

  private get teamLooks(): ReadonlyMap<number, TeamLook> {
    return teamLooksById(this.teams.teams.value ?? []);
  }

  // Runs from a timer, outside any action; an auto-bound method of a `makeAutoObservable` class is one itself.
  private tick(): void {
    this.nowMs = this.clock.now();
  }

  private async send(action: HostAction): Promise<void> {
    this.failure = undefined;
    const result = await this.round[action]();
    runInAction(() => {
      const message = describeRoundError(result.error);
      const phase = this.snapshot?.phase;
      this.failure = !result.success && message !== undefined && phase !== undefined ? { message, phase } : undefined;
    });
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
