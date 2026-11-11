import { makeAutoObservable } from 'mobx';
import { FormSubmission } from '@/mvvm/FormSubmission';
import type { TeamsStore } from '@/stores/TeamsStore';

export interface DeleteTeamTarget {
  id: number;
  name: string;
}

/**
 * ⋮ on a team card → Delete. The action is always offered: the server is the one that knows whether the team has
 * players, scores or buzz history, and it answers a `409` with a sentence that is shown as it is.
 */
export class DeleteTeamViewModel {
  readonly form: FormSubmission<never>;

  private readonly target: DeleteTeamTarget;
  private readonly close: () => void;

  constructor(target: DeleteTeamTarget, teams: TeamsStore, close: () => void) {
    this.target = target;
    this.close = close;
    this.form = new FormSubmission<never>({
      fields: [],
      validate: () => ({}),
      send: () => teams.deleteTeam(target.id),
    });
    makeAutoObservable<DeleteTeamViewModel, 'target' | 'close'>(
      this,
      { form: false, target: false, close: false },
      { autoBind: true },
    );
  }

  get teamName(): string {
    return this.target.name;
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
