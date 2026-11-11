import { observer } from 'mobx-react-lite';
import { FormDialog } from '@/components/FormDialog';
import { useDialogStyles } from '@/components/useDialogStyles';
import type { EventAdminViewModel } from './EventAdminViewModel';

/** The confirmation before Finalize. The server's refusal, if any, shows here as it was worded. */
export const FinalizeDialog = observer(function FinalizeDialog({ vm }: { vm: EventAdminViewModel }) {
  const styles = useDialogStyles();

  return (
    <FormDialog
      open={vm.isConfirming}
      title="Finalize the event?"
      submitLabel="Finalize"
      isSubmitting={vm.form.isSubmitting}
      onSubmit={() => void vm.confirm()}
      onCancel={vm.cancel}
      error={vm.form.formError}
    >
      <p className={styles.paragraph}>
        This freezes the teams, members and scores as they are now into the archive, replacing any earlier archive. The
        live event is not changed, and you can finalize again later.
      </p>
    </FormDialog>
  );
});
