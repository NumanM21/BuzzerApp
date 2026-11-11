import { makeAutoObservable, observableRef, runInAction } from 'mobx';
import type { BuzzerVisualState } from '@/domain/buzzer';
import { getBuzzerState } from '@/domain/buzzerState';
import { connectionNoticeFor } from '@/domain/connectionNotice';
import { buildQueueRows, teamLooksById, type QueueRow, type TeamLook } from '@/domain/queueRows';
import { describeRoundError, isUndeliveredRoundError } from '@/domain/roundErrors';
import type { RoundStore } from '@/stores/RoundStore';
import type { SessionStore } from '@/stores/SessionStore';
import type { TeamsStore } from '@/stores/TeamsStore';

/** A refused or failed buzz, tied to the round it happened in. */
interface BuzzFailure {
  roundId: string;
  message: string;
}

/**
 * The player's screen: the buzzer and the team queue. Everything about the round is read from the round store's
 * snapshot; this class only decides what the person may press and what to tell them.
 *
 * **One buzz per round.** A press records the round it was made in (`attemptedRoundId`) and, from that moment,
 * `canBuzz` is false until the round changes. That one rule gives "sent at once" (the button reacts before the
 * server answers), no double sends, and a fresh buzzer for the next round (a new round has a new id), with no
 * state to remember to reset. The exception is a press that never reached the server's rules (offline, call
 * failed): that one is taken back so the person can try again.
 */
export class PlayViewModel {
  private attemptedRoundId: string | undefined = undefined;
  private failure: BuzzFailure | undefined = undefined;

  private readonly round: RoundStore;
  private readonly session: SessionStore;
  private readonly teams: TeamsStore;

  constructor(round: RoundStore, session: SessionStore, teams: TeamsStore) {
    this.round = round;
    this.session = session;
    this.teams = teams;
    makeAutoObservable<PlayViewModel, 'round' | 'session' | 'teams' | 'failure'>(
      this,
      { round: false, session: false, teams: false, failure: observableRef },
      { autoBind: true },
    );
  }

  /** Teams give the queue its colours and icons, and the buzzer its team colour. */
  activate(): void {
    void this.teams.teams.ensureLoaded();
  }

  get state(): BuzzerVisualState {
    return this.status.state;
  }

  /**
   * Where the team stands, only while it is waiting its turn (the one state that shows a number). The server's
   * own number, never counted here.
   */
  get queuePosition(): number | undefined {
    return this.state === 'queued' ? this.status.position : undefined;
  }

  /** The teammate whose buzz put the team in the queue, whenever the team is in it. */
  get buzzedBy(): string | undefined {
    return this.status.buzzedBy;
  }

  /** The player's team colour, for the buzzer. Unknown until the teams have loaded: the pack's fallback shows. */
  get teamColorKey(): string | undefined {
    const teamId = this.session.me?.teamId;
    return teamId === null || teamId === undefined ? undefined : this.teamLooks.get(teamId)?.colorKey;
  }

  /** Pressed and not (yet) turned down: the buzzer says "sent" while the server's snapshot catches up. */
  get isSent(): boolean {
    return this.state === 'ready' && this.hasAttempted && this.error === undefined;
  }

  get canBuzz(): boolean {
    return this.state === 'ready' && this.round.isConnected && !this.hasAttempted;
  }

  /** Why the person can't rely on what they see, when the connection isn't up. The last snapshot stays on screen. */
  get connectionNotice(): string | undefined {
    return connectionNoticeFor(this.round.connectionState);
  }

  /**
   * What went wrong with the last buzz, as a sentence. Only while it still matters: in the round it happened in,
   * and until the team is in the queue (then the buzz evidently counted, whatever the answer said).
   */
  get error(): string | undefined {
    const failure = this.failure;
    if (failure === undefined || failure.roundId !== this.roundId || this.status.position !== undefined) {
      return undefined;
    }
    return failure.message;
  }

  /** Every team in the queue, in buzz order. */
  get queue(): QueueRow[] {
    const queue = this.round.publicSnapshot?.teamQueue ?? [];
    return buildQueueRows(queue, this.session.me?.teamId, this.teamLooks);
  }

  async buzz(): Promise<void> {
    const roundId = this.roundId;
    if (!this.canBuzz || roundId === undefined) {
      return;
    }
    // Before the await, so that a second press an instant later already finds the buzzer used.
    this.attemptedRoundId = roundId;
    this.failure = undefined;

    const result = await this.round.buzz();

    runInAction(() => {
      if (result.success) {
        return;
      }
      if (isUndeliveredRoundError(result.error) && this.attemptedRoundId === roundId) {
        this.attemptedRoundId = undefined;
      }
      const message = describeRoundError(result.error);
      if (message !== undefined) {
        this.failure = { roundId, message };
      }
    });
  }

  private get status() {
    return getBuzzerState(this.round.publicSnapshot, this.session.me?.teamId);
  }

  private get roundId(): string | undefined {
    return this.round.publicSnapshot?.roundId ?? undefined;
  }

  private get hasAttempted(): boolean {
    return this.attemptedRoundId !== undefined && this.attemptedRoundId === this.roundId;
  }

  private get teamLooks(): ReadonlyMap<number, TeamLook> {
    return teamLooksById(this.teams.teams.value ?? []);
  }
}
