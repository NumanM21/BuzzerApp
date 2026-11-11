import { observer } from 'mobx-react-lite';
import { FormDialog } from '@/components/FormDialog';
import { TeamPicker } from '@/components/TeamPicker';
import { useDialogStyles } from '@/components/useDialogStyles';
import type { MovePlayerViewModel } from './MovePlayerViewModel';

/** Lists the other teams; the person moves when one is chosen and confirmed. */
export const MovePlayerDialog = observer(function MovePlayerDialog({ vm, open }: { vm: MovePlayerViewModel; open: boolean }) {
  const styles = useDialogStyles();
  const hasOptions = vm.options.length > 0;

  return (
    <FormDialog
      open={open}
      title={`Move ${vm.subjectName} to…`}
      submitLabel="Move"
      isSubmitting={vm.form.isSubmitting}
      canSubmit={hasOptions}
      onSubmit={() => void vm.submit()}
      onCancel={vm.cancel}
      note={vm.roundNote}
      error={vm.form.formError}
    >
      {hasOptions ? (
        <TeamPicker
          legend="New team"
          options={vm.options}
          selectedId={vm.selectedTeamId}
          onSelect={vm.select}
          errorText={vm.form.fieldErrors.teamId}
        />
      ) : (
        <p className={styles.paragraph}>There is no other team to move {vm.subjectName} to.</p>
      )}
    </FormDialog>
  );
});
