import { makeAutoObservable } from 'mobx';
import { freeColorKeys } from '@/domain/teamChoices';
import { isColourTakenMessage } from '@/domain/text';
import type { PackKeys } from '@/domain/themeCatalog';
import { validateTeamName } from '@/domain/validation';
import { FormSubmission } from '@/mvvm/FormSubmission';
import type { TeamsStore } from '@/stores/TeamsStore';

type AddTeamField = 'name' | 'colorKey' | 'iconKey';
const addTeamFields: readonly AddTeamField[] = ['name', 'colorKey', 'iconKey'];

/**
 * The "Add team" dialog (admin). The colours offered are the active pack's keys that no team uses yet; every icon
 * key of the pack is offered. A team's colour and icon can't be changed afterwards (D17), so they are chosen here.
 */
export class AddTeamViewModel {
  name = '';
  readonly form: FormSubmission<AddTeamField>;

  private chosenColorKey: string | undefined = undefined;
  private chosenIconKey: string | undefined = undefined;
  private readonly teams: TeamsStore;
  private readonly packKeys: () => PackKeys | undefined;
  private readonly close: () => void;

  /** `packKeys` is read each time: it answers `undefined` until the pack's keys have loaded. */
  constructor(teams: TeamsStore, packKeys: () => PackKeys | undefined, close: () => void) {
    this.teams = teams;
    this.packKeys = packKeys;
    this.close = close;
    this.form = new FormSubmission<AddTeamField>({
      fields: addTeamFields,
      validate: () => this.validate(),
      send: () => this.create(),
      // The server's 409 sentence says whether the name or the colour clashed.
      fieldForConflict: (message) => (isColourTakenMessage(message) ? 'colorKey' : 'name'),
    });
    makeAutoObservable<AddTeamViewModel, 'teams' | 'packKeys' | 'close'>(
      this,
      { form: false, teams: false, packKeys: false, close: false },
      { autoBind: true },
    );
  }

  get isLoadingKeys(): boolean {
    return this.packKeys() === undefined;
  }

  /** The pack's colours no team uses; it can change while the dialog is open (another admin adds a team). */
  get colorKeys(): string[] {
    return freeColorKeys(this.packKeys()?.colorKeys ?? [], this.teams.teams.value ?? []);
  }

  get iconKeys(): readonly string[] {
    return this.packKeys()?.iconKeys ?? [];
  }

  /** True once the keys are known and every colour of the pack is taken: say so instead of an empty picker. */
  get noFreeColor(): boolean {
    return !this.isLoadingKeys && this.colorKeys.length === 0;
  }

  /** What was chosen, or the first free colour until then (and again if the choice was taken in the meantime). */
  get selectedColorKey(): string | undefined {
    const chosen = this.chosenColorKey;
    return chosen !== undefined && this.colorKeys.includes(chosen) ? chosen : this.colorKeys[0];
  }

  get selectedIconKey(): string | undefined {
    const chosen = this.chosenIconKey;
    return chosen !== undefined && this.iconKeys.includes(chosen) ? chosen : this.iconKeys[0];
  }

  setName(value: string): void {
    this.name = value;
    this.form.fieldEdited('name');
  }

  selectColor(key: string): void {
    this.chosenColorKey = key;
    this.form.fieldEdited('colorKey');
  }

  selectIcon(key: string): void {
    this.chosenIconKey = key;
    this.form.fieldEdited('iconKey');
  }

  async submit(): Promise<void> {
    if (await this.form.submit()) {
      this.close();
    }
  }

  cancel(): void {
    this.close();
  }

  private validate(): Partial<Record<AddTeamField, string>> {
    const errors: Partial<Record<AddTeamField, string>> = {};
    const nameError = validateTeamName(this.name);
    if (nameError !== undefined) {
      errors.name = nameError;
    }
    if (this.selectedColorKey === undefined) {
      errors.colorKey = this.noFreeColor ? 'Every colour is already used by a team' : 'Pick a colour';
    }
    if (this.selectedIconKey === undefined) {
      errors.iconKey = 'Pick an icon';
    }
    return errors;
  }

  // Only reached after the form check has found a colour and an icon.
  private create(): Promise<unknown> {
    const colorKey = this.selectedColorKey;
    const iconKey = this.selectedIconKey;
    return colorKey === undefined || iconKey === undefined
      ? Promise.reject(new Error('Pick a colour and an icon'))
      : this.teams.createTeam({ name: this.name.trim(), colorKey, iconKey });
  }
}
