import { makeAutoObservable, observableRef } from 'mobx';
import type { EventApi } from '@/api/EventApi';
import type { JoinTeam } from '@/api/types';
import type { JoinCodeMemory } from '@/domain/joinCodeMemory';
import { describeRateLimit, formatCount, isRealNameTakenMessage } from '@/domain/text';
import {
  sanitizePin,
  validateJoinCode,
  validateJoinForm,
  type JoinField,
  type JoinFieldErrors,
  type JoinFormValues,
  type JoinMode,
} from '@/domain/validation';
import { Command } from '@/mvvm/Command';
import { Countdown } from '@/mvvm/Countdown';
import { readFailure } from '@/mvvm/FormSubmission';
import { isApiError } from '@/mvvm/isApiError';
import { Loadable } from '@/mvvm/Loadable';
import type { EventStore } from '@/stores/EventStore';
import type { SessionStore } from '@/stores/SessionStore';

export type JoinTab = JoinMode;

/** What the team picker should show. `needsCode` covers "no code yet", "code changed" and "code not recognised". */
export type TeamPickerState = 'needsCode' | 'loading' | 'ready' | 'empty' | 'error';

export interface TeamOption {
  id: number;
  name: string;
  colorKey: string;
  iconKey: string;
  detail: string;
}

const CODE_NOT_RECOGNISED = 'That join code is not recognised';

const joinFields: readonly JoinField[] = ['joinCode', 'realName', 'displayName', 'pin', 'teamId'];

// What went wrong with the last submit, besides the problems that belong to one field.
type Failure =
  | { kind: 'message'; text: string; realNameTaken: boolean }
  | { kind: 'rateLimited'; retryAfterSeconds: number | undefined };

/**
 * The join screen: register as a new player or sign in. It owns the form, checks it the way the server will (so most
 * mistakes never leave the phone), fetches the team list for the join code and turns every kind of failed call into
 * text next to what caused it. On success the session store becomes signed in and the route guards move the person on.
 *
 * Which message goes on which field is the shared `readFailure` rule, as in every dialog. The submit cycle itself is
 * this class's own rather than a `FormSubmission`, because a failure here is more than a sentence: a rate limit is a
 * countdown that outlives edits and holds the button, and a taken real name comes with a "Sign in instead" action.
 */
export class JoinViewModel {
  tab: JoinTab = 'register';
  joinCode: string;
  realName = '';
  displayName = '';
  pin = '';
  teamId: number | undefined = undefined;
  fieldErrors: JoinFieldErrors = {};

  readonly submitCommand: Command;

  private failure: Failure | undefined = undefined;
  private readonly teams: Loadable<JoinTeam[]>;
  /** The code the team list belongs to (or is being fetched for): a code is looked up once, not on every blur. */
  private teamsCode = '';
  private readonly submitCooldown = new Countdown();
  private readonly teamsCooldown = new Countdown();

  private readonly session: SessionStore;
  private readonly eventApi: EventApi;
  private readonly event: EventStore;
  private readonly memory: JoinCodeMemory;

  /** `urlCode` is the `?code=` of the address, which beats the code remembered from the last visit. */
  constructor(
    session: SessionStore,
    eventApi: EventApi,
    event: EventStore,
    memory: JoinCodeMemory,
    urlCode: string | undefined,
  ) {
    this.session = session;
    this.eventApi = eventApi;
    this.event = event;
    this.memory = memory;
    this.joinCode = urlCode?.trim() || memory.recall() || '';
    this.teams = new Loadable(() => this.eventApi.getJoinTeams(this.teamsCode));
    this.submitCommand = new Command(() => this.performSubmit());
    makeAutoObservable<
      JoinViewModel,
      'session' | 'eventApi' | 'event' | 'memory' | 'teams' | 'submitCooldown' | 'teamsCooldown' | 'failure'
    >(
      this,
      {
        session: false,
        eventApi: false,
        event: false,
        memory: false,
        teams: false,
        submitCommand: false,
        submitCooldown: false,
        teamsCooldown: false,
        failure: observableRef,
        fieldErrors: observableRef,
      },
      { autoBind: true },
    );
  }

  activate(): void {
    // A remembered or linked code is complete, so the teams can be fetched before the person has touched anything.
    // Safe to run twice (StrictMode): the same code is not fetched again.
    this.loadTeams();
  }

  dispose(): void {
    this.submitCooldown.dispose();
    this.teamsCooldown.dispose();
  }

  // --- What the view shows -------------------------------------------------------------------------------------

  get eventName(): string | undefined {
    return this.event.event?.name;
  }

  get submitLabel(): string {
    return this.tab === 'register' ? 'Join' : 'Sign in';
  }

  get isSubmitting(): boolean {
    return this.submitCommand.isRunning;
  }

  get canSubmit(): boolean {
    return !this.submitCommand.isRunning && !this.submitCooldown.isActive;
  }

  /** The message for the whole form: a taken name, a wrong PIN, too many attempts, no connection. */
  get formError(): string | undefined {
    const failure = this.failure;
    if (failure === undefined) {
      return undefined;
    }
    if (failure.kind === 'message') {
      return failure.text;
    }
    if (failure.retryAfterSeconds === undefined) {
      return describeRateLimit(undefined);
    }
    // Once the wait is over the message goes, and submit is enabled again.
    return this.submitCooldown.isActive ? describeRateLimit(this.submitCooldown.secondsLeft) : undefined;
  }

  /** True after a 409 that says the real name is already registered: sign in is what that person wants. */
  get canSwitchToSignIn(): boolean {
    return this.failure?.kind === 'message' && this.failure.realNameTaken;
  }

  /** The join code's problem: what the person's own form check or the server said, or an unknown code. */
  get joinCodeError(): string | undefined {
    if (this.fieldErrors.joinCode !== undefined) {
      return this.fieldErrors.joinCode;
    }
    const error = this.teams.error;
    return this.teamsCode === this.trimmedCode && isApiError(error) && error.kind === 'notFound'
      ? CODE_NOT_RECOGNISED
      : undefined;
  }

  get pickerState(): TeamPickerState {
    if (this.trimmedCode === '' || this.teamsCode !== this.trimmedCode) {
      return 'needsCode';
    }
    if (this.teams.isLoading) {
      return 'loading';
    }
    if (this.teams.status === 'error') {
      return this.isCodeNotFound ? 'needsCode' : 'error';
    }
    if (this.teams.status === 'ready') {
      return this.teams.value?.length ? 'ready' : 'empty';
    }
    return 'needsCode';
  }

  /** The reason the team list could not be fetched, other than a code that isn't recognised (shown on the code). */
  get teamsError(): string | undefined {
    if (this.pickerState !== 'error') {
      return undefined;
    }
    const error = this.teams.error;
    if (isApiError(error) && error.kind === 'rateLimited') {
      return this.teamsCooldown.isActive ? describeRateLimit(this.teamsCooldown.secondsLeft) : error.message;
    }
    return error?.message;
  }

  get teamOptions(): TeamOption[] {
    if (this.pickerState !== 'ready') {
      return [];
    }
    return (this.teams.value ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      colorKey: team.colorKey,
      iconKey: team.iconKey,
      detail: formatCount(team.memberCount, 'player'),
    }));
  }

  /** "Continue" fetches the teams; it waits while they load and while the server asks for a pause. */
  get canLoadTeams(): boolean {
    return !this.teams.isLoading && !this.teamsCooldown.isActive;
  }

  // --- Editing ---------------------------------------------------------------------------------------------------

  /** Takes `unknown` because Fluent's tab list hands over the selected tab's value untyped; anything else is ignored. */
  selectTab(tab: unknown): void {
    if ((tab !== 'register' && tab !== 'signIn') || tab === this.tab) {
      return;
    }
    this.tab = tab;
    this.fieldErrors = {};
    this.dropMessageFailure();
    if (tab === 'register') {
      this.loadTeams();
    }
  }

  /** "Sign in instead" after a taken real name: the names and PIN typed so far stay in the form. */
  signInInstead(): void {
    this.selectTab('signIn');
  }

  setJoinCode(value: string): void {
    this.joinCode = value;
    this.edited('joinCode');
  }

  setRealName(value: string): void {
    this.realName = value;
    this.edited('realName');
  }

  setDisplayName(value: string): void {
    this.displayName = value;
    this.edited('displayName');
  }

  setPin(value: string): void {
    this.pin = sanitizePin(value);
    this.edited('pin');
  }

  selectTeam(teamId: number): void {
    this.teamId = teamId;
    this.edited('teamId');
  }

  // --- Teams ---------------------------------------------------------------------------------------------------

  /** Fetches the teams for the code, when it is a code not yet looked up (or its last lookup failed). Never rejects. */
  loadTeams(): void {
    const code = this.trimmedCode;
    if (this.tab !== 'register' || code === '' || this.teamsCooldown.isActive) {
      return;
    }
    // Once per code. A failed lookup may be tried again, except an unknown code: asking again won't change the answer.
    const alreadyAsked = code === this.teamsCode;
    if (alreadyAsked && (this.teams.status !== 'error' || this.isCodeNotFound)) {
      return;
    }
    if (!alreadyAsked) {
      // Drops the old code's list, and any lookup still running for it.
      this.teams.reset();
    }
    this.teamsCode = code;
    void this.teams.load().then(() => this.teamsLoaded(code));
  }

  /** The "Continue" button: like leaving the code box, but an empty box is reported. */
  continueWithCode(): void {
    const error = validateJoinCode(this.joinCode);
    if (error !== undefined) {
      this.fieldErrors = { ...this.fieldErrors, joinCode: error };
      return;
    }
    this.loadTeams();
  }

  // --- Submitting ------------------------------------------------------------------------------------------------

  /** Never rejects; a second call while one is running is ignored. */
  async submit(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }
    await this.submitCommand.run();
  }

  private async performSubmit(): Promise<void> {
    this.failure = undefined;
    this.fieldErrors = validateJoinForm(this.tab, this.values);
    if (Object.keys(this.fieldErrors).length > 0) {
      return;
    }

    const joinCode = this.trimmedCode;
    const realName = this.realName.trim();
    const teamId = this.teamId;
    try {
      if (this.tab === 'signIn') {
        await this.session.signIn({ joinCode, realName, pin: this.pin });
      } else if (teamId !== undefined) {
        await this.session.register({ joinCode, realName, displayName: this.displayName.trim(), pin: this.pin, teamId });
      } else {
        return; // Unreachable: the form check above insists on a team. Never send a half-filled registration.
      }
      this.memory.remember(joinCode);
    } catch (reason) {
      this.showFailure(reason);
    }
  }

  // --- Internals -------------------------------------------------------------------------------------------------

  private get trimmedCode(): string {
    return this.joinCode.trim();
  }

  private get values(): JoinFormValues {
    return {
      joinCode: this.joinCode,
      realName: this.realName,
      displayName: this.displayName,
      pin: this.pin,
      teamId: this.teamId,
    };
  }

  private get isCodeNotFound(): boolean {
    const error = this.teams.error;
    return isApiError(error) && error.kind === 'notFound';
  }

  /** A change to a field takes away that field's error, and the form's message (a rate limit stays until it ends). */
  private edited(field: JoinField): void {
    if (this.fieldErrors[field] !== undefined) {
      const remaining = { ...this.fieldErrors };
      delete remaining[field];
      this.fieldErrors = remaining;
    }
    this.dropMessageFailure();
  }

  private dropMessageFailure(): void {
    if (this.failure?.kind === 'message') {
      this.failure = undefined;
    }
  }

  // Runs after the lookup of `code` finished (an auto-bound method, so it may change state after the `await`).
  private teamsLoaded(code: string): void {
    // The code was changed while the lookup ran: this answer is for another code.
    if (code !== this.teamsCode) {
      return;
    }
    const error = this.teams.error;
    if (isApiError(error) && error.kind === 'rateLimited') {
      this.teamsCooldown.start(error.retryAfterSeconds ?? 0);
    }
    if (this.teams.status !== 'ready') {
      return;
    }
    this.memory.remember(code);
    // A team chosen from another code's list (or one that has since gone) must not be submitted.
    if (this.teamId !== undefined && !this.teams.value?.some((team) => team.id === this.teamId)) {
      this.teamId = undefined;
    }
  }

  private showFailure(reason: unknown): void {
    if (isApiError(reason) && reason.kind === 'notFound') {
      this.fieldErrors = { ...this.fieldErrors, joinCode: CODE_NOT_RECOGNISED };
      return;
    }
    if (isApiError(reason) && reason.kind === 'rateLimited') {
      this.failure = { kind: 'rateLimited', retryAfterSeconds: reason.retryAfterSeconds };
      this.submitCooldown.start(reason.retryAfterSeconds ?? 0);
      return;
    }
    // Everything else reads the way every form reads it: field messages under their fields, the rest on the form
    // (a taken name, a wrong name or PIN, no connection, a server fault), in the server's own words.
    const { fieldErrors, message } = readFailure(reason, joinFields);
    this.fieldErrors = fieldErrors;
    this.failure =
      message === undefined
        ? undefined
        : { kind: 'message', text: message, realNameTaken: this.isRealNameTaken(reason, message) };
  }

  /** Only a registration's 409 can mean "you are already registered": that is when signing in instead helps. */
  private isRealNameTaken(reason: unknown, message: string): boolean {
    return (
      this.tab === 'register' && isApiError(reason) && reason.kind === 'conflict' && isRealNameTakenMessage(message)
    );
  }
}
