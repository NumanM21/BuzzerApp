import { Field, Input } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { FormDialog } from '@/components/FormDialog';
import { useTextBoxStyles } from '@/components/useTextBoxStyles';
import type { EditNamesViewModel } from './EditNamesViewModel';

/** Display name and real name, both prefilled; the view model sends only what changed. */
export const EditNamesDialog = observer(function EditNamesDialog({ vm, open }: { vm: EditNamesViewModel; open: boolean }) {
  const textBox = useTextBoxStyles();
  const { fieldErrors } = vm.form;

  return (
    <FormDialog
      open={open}
      title={vm.isOwn ? 'Edit your names' : `Edit names: ${vm.subjectName}`}
      submitLabel="Save"
      isSubmitting={vm.form.isSubmitting}
      onSubmit={() => void vm.submit()}
      onCancel={vm.cancel}
      note={vm.roundNote}
      error={vm.form.formError}
    >
      <Field
        label="Display name"
        hint="What everyone sees next to a buzz and a score."
        validationMessage={fieldErrors.displayName}
        validationState={fieldErrors.displayName ? 'error' : 'none'}
      >
        <Input
          className={textBox.textBox}
          value={vm.displayName}
          autoComplete="off"
          onChange={(_, data) => vm.setDisplayName(data.value)}
        />
      </Field>
      <Field
        label="Real name"
        hint="Only the hosts can see it."
        validationMessage={fieldErrors.realName}
        validationState={fieldErrors.realName ? 'error' : 'none'}
      >
        <Input
          className={textBox.textBox}
          value={vm.realName}
          autoComplete="off"
          onChange={(_, data) => vm.setRealName(data.value)}
        />
      </Field>
    </FormDialog>
  );
});
