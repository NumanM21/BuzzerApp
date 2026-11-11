import { observer } from 'mobx-react-lite';
import { FormDialog } from '@/components/FormDialog';
import { useDialogStyles } from '@/components/useDialogStyles';
import type { DeleteTeamViewModel } from './DeleteTeamViewModel';

/** The server's refusal (the team has players, scores or buzz history) shows here as it was worded. */
export const DeleteTeamDialog = observer(function DeleteTeamDialog({ vm, open }: { vm: DeleteTeamViewModel; open: boolean }) {
  const styles = useDialogStyles();

  return (
    <FormDialog
      open={open}
      title={`Delete ${vm.teamName}?`}
      submitLabel="Delete team"
      isSubmitting={vm.form.isSubmitting}
      onSubmit={() => void vm.submit()}
      onCancel={vm.cancel}
      error={vm.form.formError}
    >
      <p className={styles.paragraph}>
        <span className={styles.emphasis}>{vm.teamName}</span> will be removed. A team that has players, scores or buzz
        history can&apos;t be deleted.
      </p>
    </FormDialog>
  );
});
