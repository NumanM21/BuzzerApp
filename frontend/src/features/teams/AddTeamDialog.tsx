import { Field, Input, Spinner } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { FormDialog } from '@/components/FormDialog';
import { TeamStylePicker } from '@/components/TeamStylePicker';
import type { AddTeamViewModel } from './AddTeamViewModel';
import { useDialogStyles } from '@/components/useDialogStyles';

/** Name, then a colour no team uses yet, then an icon. Colour and icon can't be changed afterwards. */
export const AddTeamDialog = observer(function AddTeamDialog({ vm }: { vm: AddTeamViewModel }) {
  const styles = useDialogStyles();
  const { fieldErrors } = vm.form;

  return (
    <FormDialog
      title="Add a team"
      submitLabel="Add team"
      isSubmitting={vm.form.isSubmitting}
      canSubmit={!vm.isLoadingKeys && !vm.noFreeColor}
      onSubmit={() => void vm.submit()}
      onCancel={vm.cancel}
      error={vm.form.formError}
    >
      <Field label="Team name" validationMessage={fieldErrors.name} validationState={fieldErrors.name ? 'error' : 'none'}>
        <Input
          className={styles.input}
          value={vm.name}
          autoComplete="off"
          onChange={(_, data) => vm.setName(data.value)}
        />
      </Field>
      {vm.isLoadingKeys ? (
        <Spinner label="Loading the colours and icons" />
      ) : (
        <>
          {vm.noFreeColor ? (
            <p className={styles.paragraph}>
              Every colour in this theme is already used by a team, so no more teams can be added.
            </p>
          ) : (
            <TeamStylePicker
              legend="Colour"
              kind="color"
              keys={vm.colorKeys}
              selectedKey={vm.selectedColorKey}
              onSelect={vm.selectColor}
              errorText={fieldErrors.colorKey}
            />
          )}
          <TeamStylePicker
            legend="Icon"
            kind="icon"
            keys={vm.iconKeys}
            selectedKey={vm.selectedIconKey}
            previewColorKey={vm.selectedColorKey}
            onSelect={vm.selectIcon}
            errorText={fieldErrors.iconKey}
          />
          <p className={styles.paragraph}>The colour and icon can&apos;t be changed afterwards.</p>
        </>
      )}
    </FormDialog>
  );
});
