import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '@/test/renderWithApp';
import { FormDialog, type FormDialogProps } from './FormDialog';

function renderDialog(props: Partial<FormDialogProps> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const result = renderWithApp(
    <FormDialog open title="Rename" submitLabel="Save" isSubmitting={false} onSubmit={onSubmit} onCancel={onCancel} {...props}>
      <label>
        Name
        <input />
      </label>
    </FormDialog>,
  );
  return { ...result, onSubmit, onCancel };
}

describe('FormDialog', () => {
  it('is a dialog named by its title, with its fields', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('submits on the confirm button and on Enter in a field, without a page reload', async () => {
    const { user, onSubmit } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.type(screen.getByLabelText('Name'), 'x{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('cancels with the button and with Escape', async () => {
    const { user, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('disables the confirm button while submitting, so a double tap sends once', () => {
    renderDialog({ isSubmitting: true });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the note and the error as text', () => {
    renderDialog({ note: 'A round is running.', error: 'Could not reach the server.' });

    expect(screen.getByText('A round is running.')).toBeInTheDocument();
    expect(screen.getByText('Could not reach the server.')).toBeInTheDocument();
  });

  it('hides the confirm button when it cannot be confirmed, leaving Cancel', () => {
    renderDialog({ canSubmit: false });

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
