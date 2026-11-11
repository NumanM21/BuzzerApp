import { makeAutoObservable, observableRef, runInAction } from 'mobx';
import type { ArchiveApi } from '@/api/ArchiveApi';
import type { FinalizeResponse } from '@/api/types';
import { formatClockTime } from '@/domain/clockTime';
import { FormSubmission } from '@/mvvm/FormSubmission';

/**
 * `/admin/event`: freeze the event's results into the archive (Finalize) and download the file (Export).
 *
 * **Export needs a Finalize first, in this session.** The export link needs the event's id, and only the finalize
 * call returns it. That is acceptable because finalizing again is harmless (it replaces the archive), but it means
 * a host who opens this screen fresh must finalize before they can export. Showing Export straight away would need
 * the event id on `GET /api/event` (a backend change); that is a decision for F9 and the developer.
 *
 * **The file never passes through the app.** It holds real names, so Export is a plain link the browser follows and
 * saves; nothing here fetches, keeps or stores it.
 */
export class EventAdminViewModel {
  /** The last finalize's answer, in this session. Not kept anywhere else. */
  finalized: FinalizeResponse | undefined = undefined;
  /** The confirmation dialog is showing. */
  isConfirming = false;
  /** Fresh for every confirmation, so an error from an earlier attempt doesn't greet the next one. */
  form: FormSubmission<never>;

  private readonly archive: ArchiveApi;

  constructor(archive: ArchiveApi) {
    this.archive = archive;
    this.form = this.createForm();
    makeAutoObservable<EventAdminViewModel, 'archive' | 'createForm' | 'runFinalize'>(
      this,
      { finalized: observableRef, form: observableRef, archive: false, createForm: false, runFinalize: false },
      { autoBind: true },
    );
  }

  /** "Finalized at 23:00", in the viewer's own time; nothing until this session has finalized. */
  get finalizedText(): string | undefined {
    return this.finalized === undefined ? undefined : `Finalized at ${formatClockTime(this.finalized.finalizedAt)}`;
  }

  /** Where the browser downloads the archive from; nothing until this session has finalized. */
  get exportUrl(): string | undefined {
    return this.finalized === undefined ? undefined : this.archive.exportUrl(this.finalized.eventId);
  }

  /** The name the file will have (the server names it by the event's year), so the host knows what they are saving. */
  get exportFileName(): string | undefined {
    return this.finalized === undefined ? undefined : `buzzer-archive-${this.finalized.year}.json`;
  }

  askToFinalize(): void {
    this.form = this.createForm();
    this.isConfirming = true;
  }

  cancel(): void {
    this.isConfirming = false;
  }

  /** Sends the finalize; the dialog closes only when the server accepted it, and otherwise shows its sentence. */
  async confirm(): Promise<void> {
    if (await this.form.submit()) {
      runInAction(() => {
        this.isConfirming = false;
      });
    }
  }

  private createForm(): FormSubmission<never> {
    return new FormSubmission<never>({
      fields: [],
      validate: () => ({}),
      send: () => this.runFinalize(),
    });
  }

  private async runFinalize(): Promise<void> {
    const response = await this.archive.finalize();
    runInAction(() => {
      this.finalized = response;
    });
  }
}
