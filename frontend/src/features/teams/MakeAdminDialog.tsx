import { observer } from 'mobx-react-lite';
import { FormDialog } from '@/components/FormDialog';
import { useDialogStyles } from '@/components/useDialogStyles';
import type { MakeAdminViewModel } from './MakeAdminViewModel';

/** A plain warning first: promoting is a one-way step in this app. */
export const MakeAdminDialog = observer(function MakeAdminDialog({ vm, open }: { vm: MakeAdminViewModel; open: boolean }) {
  const styles = useDialogStyles();

  return (
    <FormDialog
      open={open}
      title={`Make ${vm.subjectName} an admin?`}
      submitLabel="Make admin"
      isSubmitting={vm.form.isSubmitting}
      onSubmit={() => void vm.submit()}
      onCancel={vm.cancel}
      error={vm.form.formError}
    >
      <p className={styles.paragraph}>
        {vm.teamName === null
          ? `${vm.subjectName} will become a host.`
          : `${vm.subjectName} will become a host and leave ${vm.teamName}.`}{' '}
        Hosts run the game: they don&apos;t buzz and don&apos;t belong to a team.
      </p>
      <p className={styles.paragraph}>
        <span className={styles.emphasis}>This can&apos;t be undone in the app.</span> There is no way to turn an admin
        back into a player.
      </p>
    </FormDialog>
  );
});
