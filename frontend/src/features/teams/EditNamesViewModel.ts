import { makeAutoObservable } from 'mobx';
import { changedNames, type NameChanges } from '@/domain/nameEdits';
import { ROUND_RUNNING_NOTE, isRealNameTakenMessage } from '@/domain/text';
import { validatePersonName } from '@/domain/validation';
import { FormSubmission } from '@/mvvm/FormSubmission';
import type { TeamsStore } from '@/stores/TeamsStore';

export interface EditNamesTarget {
  playerId: number;
  displayName: string;
  /** Null when the server didn't send it; the box then starts empty and an untouched box sends nothing. */
  realName: string | null;
  /** The viewer's own row: a player edits through `/players/me`, an admin through `/players/{id}`. */
  isOwn: boolean;
}

type NameField = 'displayName' | 'realName';
const nameFields: readonly NameField[] = ['displayName', 'realName'];

/** The dialog behind ✎ (a player's own row) and ⋮ → Edit names (an admin, anyone). */
export class EditNamesViewModel {
  displayName: string;
  realName: string;
  readonly form: FormSubmission<NameField>;

  private readonly target: EditNamesTarget;
  private readonly teams: TeamsStore;
  private readonly isRoundRunning: () => boolean;
  private readonly close: () => void;

  constructor(target: EditNamesTarget, teams: TeamsStore, isRoundRunning: () => boolean, close: () => void) {
    this.target = target;
    this.teams = teams;
    this.isRoundRunning = isRoundRunning;
    this.close = close;
    this.displayName = target.displayName;
    this.realName = target.realName ?? '';
    this.form = new FormSubmission<NameField>({
      fields: nameFields,
      validate: () => this.validate(),
      send: () => this.send(),
      // The server's 409 sentence says which of the two names is taken.
      fieldForConflict: (message) => (isRealNameTakenMessage(message) ? 'realName' : 'displayName'),
    });
    makeAutoObservable<EditNamesViewModel, 'target' | 'teams' | 'isRoundRunning' | 'close'>(
      this,
      { form: false, target: false, teams: false, isRoundRunning: false, close: false },
      { autoBind: true },
    );
  }

  get subjectName(): string {
    return this.target.displayName;
  }

  get isOwn(): boolean {
    return this.target.isOwn;
  }

  get roundNote(): string | undefined {
    return this.isRoundRunning() ? ROUND_RUNNING_NOTE : undefined;
  }

  setDisplayName(value: string): void {
    this.displayName = value;
    this.form.fieldEdited('displayName');
  }

  setRealName(value: string): void {
    this.realName = value;
    this.form.fieldEdited('realName');
  }

  /** Nothing changed: just close, and ask the server nothing. */
  async submit(): Promise<void> {
    if (Object.keys(this.changes).length === 0) {
      this.close();
      return;
    }
    if (await this.form.submit()) {
      this.close();
    }
  }

  cancel(): void {
    this.close();
  }

  private get changes(): NameChanges {
    return changedNames(this.target, { displayName: this.displayName, realName: this.realName });
  }

  // Only the names being changed are checked: an unchanged one is already accepted by the server.
  private validate(): Partial<Record<NameField, string>> {
    const changes = this.changes;
    const errors: Partial<Record<NameField, string>> = {};
    const displayNameError = changes.displayName === undefined ? undefined : validatePersonName(changes.displayName);
    if (displayNameError !== undefined) {
      errors.displayName = displayNameError;
    }
    const realNameError = changes.realName === undefined ? undefined : validatePersonName(changes.realName);
    if (realNameError !== undefined) {
      errors.realName = realNameError;
    }
    return errors;
  }

  private send(): Promise<unknown> {
    const changes = this.changes;
    return this.target.isOwn ? this.teams.editOwnNames(changes) : this.teams.editNames(this.target.playerId, changes);
  }
}
