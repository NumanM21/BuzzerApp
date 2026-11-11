import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/ApiError';
import { deferred } from '@/test/deferred';
import { FormSubmission, readFailure } from './FormSubmission';

type Field = 'name' | 'colorKey';
const fields: readonly Field[] = ['name', 'colorKey'];

function problem(kind: ConstructorParameters<typeof ApiError>[0]['kind'], extra: { detail?: string; fieldErrors?: Record<string, string[]> } = {}) {
  const status = { validation: 400, conflict: 409, forbidden: 403, network: 0, server: 500 } as const;
  return new ApiError({ status: status[kind as keyof typeof status] ?? 500, kind, ...extra });
}

describe('readFailure', () => {
  it('puts each validation message on its field', () => {
    const failure = readFailure(problem('validation', { fieldErrors: { name: ['Too short.'], colorKey: ['Bad.'] } }), fields);
    expect(failure).toEqual({ fieldErrors: { name: 'Too short.', colorKey: 'Bad.' }, message: undefined });
  });

  it('joins several messages for one field', () => {
    const failure = readFailure(problem('validation', { fieldErrors: { name: ['One.', 'Two.'] } }), fields);
    expect(failure.fieldErrors.name).toBe('One. Two.');
  });

  it('puts a message for a field the form does not have on the form', () => {
    const failure = readFailure(problem('validation', { fieldErrors: { name: ['Short.'], other: ['Odd.'] } }), fields);
    expect(failure).toEqual({ fieldErrors: { name: 'Short.' }, message: 'Odd.' });
  });

  it('falls back to the error text when a 400 names no field', () => {
    const failure = readFailure(problem('validation', { detail: 'Nothing to change.' }), fields);
    expect(failure).toEqual({ fieldErrors: {}, message: 'Nothing to change.' });
  });

  it('puts a conflict on the field the sentence concerns', () => {
    const failure = readFailure(problem('conflict', { detail: 'Colour used.' }), fields, () => 'colorKey');
    expect(failure).toEqual({ fieldErrors: { colorKey: 'Colour used.' }, message: undefined });
  });

  it('puts a conflict on the form when no field fits', () => {
    expect(readFailure(problem('conflict', { detail: 'In use.' }), fields, () => undefined).message).toBe('In use.');
    expect(readFailure(problem('conflict', { detail: 'In use.' }), fields).message).toBe('In use.');
  });

  it.each(['forbidden', 'network', 'server'] as const)('uses the error text for %s', (kind) => {
    const error = problem(kind);
    expect(readFailure(error, fields)).toEqual({ fieldErrors: {}, message: error.message });
  });

  it('uses the message of an error that is not an ApiError', () => {
    expect(readFailure(new Error('Boom'), fields).message).toBe('Boom');
  });
});

describe('FormSubmission', () => {
  function create(overrides: Partial<ConstructorParameters<typeof FormSubmission<Field>>[0]> = {}) {
    const sent: number[] = [];
    const form = new FormSubmission<Field>({
      fields,
      validate: () => ({}),
      send: async () => {
        sent.push(sent.length);
      },
      ...overrides,
    });
    return { form, sent };
  }

  it('sends and reports success', async () => {
    const { form, sent } = create();
    expect(await form.submit()).toBe(true);
    expect(sent).toHaveLength(1);
    expect(form.formError).toBeUndefined();
  });

  it('shows validation messages and sends nothing', async () => {
    const { form, sent } = create({ validate: () => ({ name: 'Use 2 to 24 characters' }) });
    expect(await form.submit()).toBe(false);
    expect(form.fieldErrors).toEqual({ name: 'Use 2 to 24 characters' });
    expect(sent).toHaveLength(0);
  });

  it('shows a server refusal and reports failure', async () => {
    const { form } = create({
      send: () => Promise.reject(problem('conflict', { detail: 'Name taken.' })),
      fieldForConflict: () => 'name',
    });
    expect(await form.submit()).toBe(false);
    expect(form.fieldErrors).toEqual({ name: 'Name taken.' });
  });

  it('ignores a second submit while one is running', async () => {
    const gate = deferred<void>();
    let calls = 0;
    const { form } = create({
      send: async () => {
        calls += 1;
        await gate.promise;
      },
    });
    const first = form.submit();
    expect(form.isSubmitting).toBe(true);
    expect(await form.submit()).toBe(false);
    gate.resolve();
    expect(await first).toBe(true);
    expect(calls).toBe(1);
    expect(form.isSubmitting).toBe(false);
  });

  it('clears the field message and the form message when the field is edited', async () => {
    const { form } = create({ validate: () => ({ name: 'Bad' }) });
    await form.submit();
    form.showFormError('Something else');
    form.fieldEdited('name');
    expect(form.fieldErrors.name).toBeUndefined();
    expect(form.formError).toBeUndefined();
  });

  it('clears an old refusal when submitted again', async () => {
    let fail = true;
    const { form } = create({
      send: async () => {
        if (fail) {
          throw problem('server');
        }
      },
    });
    expect(await form.submit()).toBe(false);
    expect(form.formError).toBeDefined();
    fail = false;
    expect(await form.submit()).toBe(true);
    expect(form.formError).toBeUndefined();
  });
});
