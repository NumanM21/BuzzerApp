import { makeAutoObservable } from 'mobx';
import { FormSubmission } from '@/mvvm/FormSubmission';
import type { TeamsStore } from '@/stores/TeamsStore';

export interface MakeAdminTarget {
  playerId: number;
  displayName: string;
  teamName: string | null;
}

/** ⋮ on a member → Make admin. The API has no way back (no demote), so the dialog says so before it asks. */
export class MakeAdminViewModel {
  readonly form: FormSubmission<never>;

  private readonly target: MakeAdminTarget;
  private readonly close: () => void;

  constructor(target: MakeAdminTarget, teams: TeamsStore, close: () => void) {
    this.target = target;
    this.close = close;
    this.form = new FormSubmission<never>({
      fields: [],
      validate: () => ({}),
      send: () => teams.promote(target.playerId),
    });
    makeAutoObservable<MakeAdminViewModel, 'target' | 'close'>(
      this,
      { form: false, target: false, close: false },
      { autoBind: true },
    );
  }

  get subjectName(): string {
    return this.target.displayName;
  }

  /** The team the person leaves, when they are on one. */
  get teamName(): string | null {
    return this.target.teamName;
  }

  async submit(): Promise<void> {
    if (await this.form.submit()) {
      this.close();
    }
  }

  cancel(): void {
    this.close();
  }
}
