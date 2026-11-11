import { makeAutoObservable, observableRef, runInAction } from 'mobx';
import { Command } from './Command';
import { isApiError } from './isApiError';
import { toError } from './toError';

/** The message and the per-field messages a failed call becomes. */
export interface FailureText<F extends string> {
  fieldErrors: Partial<Record<F, string>>;
  /** What belongs to the whole form, or `undefined` when every message found a field. */
  message: string | undefined;
}

/**
 * Turns whatever a store write threw into text for a form.
 *
 * - A `400` names request fields (`displayName`, `name`): each message goes on its field. A field the form doesn't
 *   have goes on the form, so nothing the server said is swallowed.
 * - A `409` carries one sentence. `fieldForConflict` says which field it concerns (the sentence is the only clue);
 *   without it, or when it answers `undefined`, the sentence goes on the form.
 * - Anything else (no connection, a server fault, `403`) is the form's message: the server's own sentence.
 */
export function readFailure<F extends string>(
  reason: unknown,
  fields: readonly F[],
  fieldForConflict?: (message: string) => F | undefined,
): FailureText<F> {
  if (!isApiError(reason)) {
    return { fieldErrors: {}, message: toError(reason).message };
  }
  const fieldErrors: Partial<Record<F, string>> = {};
  if (reason.kind === 'validation') {
    const leftovers: string[] = [];
    for (const [name, messages] of Object.entries(reason.fieldErrors)) {
      const text = messages.join(' ');
      if (text === '') {
        continue;
      }
      const field = fields.find((candidate) => candidate === name);
      if (field === undefined) {
        leftovers.push(text);
      } else {
        fieldErrors[field] = text;
      }
    }
    if (leftovers.length > 0) {
      return { fieldErrors, message: leftovers.join(' ') };
    }
    return { fieldErrors, message: Object.keys(fieldErrors).length === 0 ? reason.message : undefined };
  }
  if (reason.kind === 'conflict') {
    const field = fieldForConflict?.(reason.message);
    if (field !== undefined) {
      fieldErrors[field] = reason.message;
      return { fieldErrors, message: undefined };
    }
  }
  return { fieldErrors, message: reason.message };
}

/**
 * What every dialog's "submit" does, once: check the form on the phone, send, and show what went wrong next to what
 * caused it. A view model owns one (composition, not a base class) and supplies the two parts that differ.
 *
 * `submit()` resolves to `true` only when the server accepted the change, so the view model can close its dialog.
 * It never rejects, and a second call while one is running is ignored (no double submit).
 */
export class FormSubmission<F extends string> {
  fieldErrors: Partial<Record<F, string>> = {};
  formError: string | undefined = undefined;

  private readonly command: Command;
  private readonly fields: readonly F[];
  private readonly validate: () => Partial<Record<F, string>>;
  private readonly send: () => Promise<unknown>;
  private readonly fieldForConflict: ((message: string) => F | undefined) | undefined;
  private accepted = false;

  constructor(options: {
    fields: readonly F[];
    /** The same checks the server makes; an empty object means the form may be sent. */
    validate: () => Partial<Record<F, string>>;
    send: () => Promise<unknown>;
    fieldForConflict?: (message: string) => F | undefined;
  }) {
    this.fields = options.fields;
    this.validate = options.validate;
    this.send = options.send;
    this.fieldForConflict = options.fieldForConflict;
    this.command = new Command(() => this.attempt());
    makeAutoObservable<
      FormSubmission<F>,
      'command' | 'fields' | 'validate' | 'send' | 'fieldForConflict' | 'accepted'
    >(
      this,
      {
        fieldErrors: observableRef,
        command: false,
        fields: false,
        validate: false,
        send: false,
        fieldForConflict: false,
        accepted: false,
      },
      { autoBind: true },
    );
  }

  get isSubmitting(): boolean {
    return this.command.isRunning;
  }

  async submit(): Promise<boolean> {
    this.accepted = false;
    await this.command.run();
    return this.accepted;
  }

  /** Editing a field takes away its message, and the form's, which was about what was sent before. */
  fieldEdited(field: F): void {
    if (this.fieldErrors[field] !== undefined) {
      const remaining = { ...this.fieldErrors };
      delete remaining[field];
      this.fieldErrors = remaining;
    }
    this.formError = undefined;
  }

  /** Shows a problem the view model found itself (for example "nothing to send"). */
  showFormError(message: string): void {
    this.formError = message;
  }

  private async attempt(): Promise<void> {
    this.formError = undefined;
    this.fieldErrors = this.validate();
    if (Object.keys(this.fieldErrors).length > 0) {
      return;
    }
    try {
      await this.send();
      this.accepted = true;
    } catch (reason) {
      const failure = readFailure(reason, this.fields, this.fieldForConflict);
      runInAction(() => {
        this.fieldErrors = failure.fieldErrors;
        this.formError = failure.message;
      });
    }
  }
}
