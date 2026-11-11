import { makeAutoObservable } from 'mobx';
import { ROUND_RUNNING_NOTE } from '@/domain/text';
import { validateTeamName } from '@/domain/validation';
import { FormSubmission } from '@/mvvm/FormSubmission';
import type { TeamsStore } from '@/stores/TeamsStore';

export interface RenameTeamTarget {
  id: number;
  name: string;
}

/** ⋮ on a team card → Rename (admin). */
export class RenameTeamViewModel {
  name: string;
  readonly form: FormSubmission<'name'>;

  private readonly target: RenameTeamTarget;
  private readonly teams: TeamsStore;
  private readonly isRoundRunning: () => boolean;
  private readonly close: () => void;

  constructor(target: RenameTeamTarget, teams: TeamsStore, isRoundRunning: () => boolean, close: () => void) {
    this.target = target;
    this.teams = teams;
    this.isRoundRunning = isRoundRunning;
    this.close = close;
    this.name = target.name;
    this.form = new FormSubmission<'name'>({
      fields: ['name'],
      validate: () => {
        const message = validateTeamName(this.name);
        return message === undefined ? {} : { name: message };
      },
      send: () => this.teams.renameTeam(this.target.id, this.name.trim()),
      // The only 409 on a rename is a name already in use.
      fieldForConflict: () => 'name',
    });
    makeAutoObservable<RenameTeamViewModel, 'target' | 'teams' | 'isRoundRunning' | 'close'>(
      this,
      { form: false, target: false, teams: false, isRoundRunning: false, close: false },
      { autoBind: true },
    );
  }

  get currentName(): string {
    return this.target.name;
  }

  get roundNote(): string | undefined {
    return this.isRoundRunning() ? ROUND_RUNNING_NOTE : undefined;
  }

  setName(value: string): void {
    this.name = value;
    this.form.fieldEdited('name');
  }

  /** An unchanged name is no rename: close without asking the server. */
  async submit(): Promise<void> {
    if (this.name.trim() === this.target.name.trim()) {
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
}
