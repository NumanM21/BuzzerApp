import { Field, Input } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { FormDialog } from '@/components/FormDialog';
import { useTextBoxStyles } from '@/components/useTextBoxStyles';
import type { RenameTeamViewModel } from './RenameTeamViewModel';

export const RenameTeamDialog = observer(function RenameTeamDialog({ vm, open }: { vm: RenameTeamViewModel; open: boolean }) {
  const textBox = useTextBoxStyles();
  const error = vm.form.fieldErrors.name;

  return (
    <FormDialog
      open={open}
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
          className={textBox.textBox}
          value={vm.name}
          autoComplete="off"
          onChange={(_, data) => vm.setName(data.value)}
        />
      </Field>
    </FormDialog>
  );
});
