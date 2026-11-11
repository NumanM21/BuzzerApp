import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import type { FormEvent, ReactNode } from 'react';
import { TAP_TARGET } from './sizes';

export interface FormDialogProps {
  /**
   * False while the dialog is closing. Close a dialog by passing `false`, not by no longer rendering it: only then
   * does it un-hide the rest of the app for screen readers and return the keyboard to the button that opened it.
   */
  open: boolean;
  title: string;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  /** A heads-up shown above the fields (for example "a round is running"). */
  note?: string;
  /** What went wrong with the whole form; messages for one field belong next to that field. */
  error?: string;
  /** Hides the submit button, for a dialog that can't be confirmed right now (nothing to choose from). */
  canSubmit?: boolean;
  children: ReactNode;
}

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  button: {
    minHeight: TAP_TARGET,
  },
});

/**
 * The frame every small dialog shares: a title, the fields, the form's own error, and Cancel / confirm. Enter in a
 * field submits. It is only the frame: what the fields are and what happens on submit belong to the view model.
 */
export const FormDialog = observer(function FormDialog({
  open,
  title,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
  note,
  error,
  canSubmit = true,
  children,
}: FormDialogProps) {
  const styles = useStyles();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // The confirm button stays focusable while submitting (see below), so the browser still submits the form on a
    // second tap or on Enter. Ignoring it here is what `disabled` used to do.
    if (!isSubmitting) {
      onSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      modalType="modal"
      onOpenChange={(_, data) => {
        if (!data.open) {
          onCancel();
        }
      }}
    >
      <DialogSurface aria-describedby={undefined}>
        <form onSubmit={handleSubmit} noValidate>
          <DialogBody>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent className={styles.content}>
              {note && (
                <MessageBar intent="info">
                  <MessageBarBody>{note}</MessageBarBody>
                </MessageBar>
              )}
              {children}
              {error && (
                <MessageBar intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <Button className={styles.button} appearance="secondary" onClick={onCancel}>
                Cancel
              </Button>
              {/* Held (`disabledFocusable`), not `disabled`, while submitting: a disabled button drops the keyboard
                  focus it has, and the dialog would then close with no focus to return to the button that opened
                  it. */}
              {canSubmit && (
                <Button className={styles.button} appearance="primary" type="submit" disabledFocusable={isSubmitting}>
                  {submitLabel}
                </Button>
              )}
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
});
