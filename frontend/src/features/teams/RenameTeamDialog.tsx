import { Field, Input } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { FormDialog } from '@/components/FormDialog';
import { useDialogStyles } from '@/components/useDialogStyles';
import type { RenameTeamViewModel } from './RenameTeamViewModel';

export const RenameTeamDialog = observer(function RenameTeamDialog({ vm }: { vm: RenameTeamViewModel }) {
  const styles = useDialogStyles();
  const error = vm.form.fieldErrors.name;

  return (
    <FormDialog
      title={`Rename ${vm.currentName}`}
      submitLabel="Rename"
      isSubmitting={vm.form.isSubmitting}
      onSubmit={() => void vm.submit()}
      onCancel={vm.cancel}
      note={vm.roundNote}
      error={vm.form.formError}
    >
      <Field label="Team name" validationMessage={error} validationState={error ? 'error' : 'none'}>
        <Input
          className={styles.input}
          value={vm.name}
          autoComplete="off"
          onChange={(_, data) => vm.setName(data.value)}
        />
      </Field>
    </FormDialog>
  );
});
