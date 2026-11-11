import { makeAutoObservable } from 'mobx';
import { otherTeams } from '@/domain/teamChoices';
import { ROUND_RUNNING_NOTE, formatCount } from '@/domain/text';
import { FormSubmission } from '@/mvvm/FormSubmission';
import type { TeamsStore } from '@/stores/TeamsStore';

export interface MovePlayerTarget {
  playerId: number;
  displayName: string;
  /** The team the person is on now; it is left out of the choices. */
  teamId: number | null;
}

export interface MoveOption {
  id: number;
  name: string;
  colorKey: string;
  iconKey: string;
  /** For example "3 players". */
  detail: string;
}

/** ⋮ on a member → Move to… (admin): pick one of the other teams and confirm. */
export class MovePlayerViewModel {
  selectedTeamId: number | undefined = undefined;
  readonly form: FormSubmission<'teamId'>;

  private readonly target: MovePlayerTarget;
  private readonly teams: TeamsStore;
  private readonly isRoundRunning: () => boolean;
  private readonly close: () => void;

  constructor(target: MovePlayerTarget, teams: TeamsStore, isRoundRunning: () => boolean, close: () => void) {
    this.target = target;
    this.teams = teams;
    this.isRoundRunning = isRoundRunning;
    this.close = close;
    this.form = new FormSubmission<'teamId'>({
      fields: ['teamId'],
      validate: () => (this.selectedTeamId === undefined ? { teamId: 'Pick a team to move to' } : {}),
      send: () => this.move(),
    });
    makeAutoObservable<MovePlayerViewModel, 'target' | 'teams' | 'isRoundRunning' | 'close'>(
      this,
      { form: false, target: false, teams: false, isRoundRunning: false, close: false },
      { autoBind: true },
    );
  }

  get subjectName(): string {
    return this.target.displayName;
  }

  /** The other teams, in the server's order, as the picker draws them. */
  get options(): MoveOption[] {
    return otherTeams(this.teams.teams.value ?? [], this.target.teamId).map((team) => ({
      id: team.id,
      name: team.name,
      colorKey: team.colorKey,
      iconKey: team.iconKey,
      detail: formatCount(team.members.length, 'player'),
    }));
  }

  get roundNote(): string | undefined {
    return this.isRoundRunning() ? ROUND_RUNNING_NOTE : undefined;
  }

  select(teamId: number): void {
    this.selectedTeamId = teamId;
    this.form.fieldEdited('teamId');
  }

  async submit(): Promise<void> {
    if (await this.form.submit()) {
      this.close();
    }
  }

  cancel(): void {
    this.close();
  }

  // Only reached after the form check has insisted on a choice.
  private move(): Promise<unknown> {
    const teamId = this.selectedTeamId;
    return teamId === undefined
      ? Promise.reject(new Error('Pick a team to move to'))
      : this.teams.movePlayer(this.target.playerId, teamId);
  }
}
