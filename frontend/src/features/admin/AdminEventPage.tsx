import { Button, makeStyles, tokens, useRestoreFocusTarget } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useViewModel } from '@/app/useViewModel';
import { usePageStyles } from '@/components/usePageStyles';
import { EventAdminViewModel } from './EventAdminViewModel';
import { FinalizeDialog } from './FinalizeDialog';
import { LARGE_TAP_TARGET } from '@/components/sizes';

const useStyles = makeStyles({
  text: {
    margin: 0,
    overflowWrap: 'anywhere',
  },
  button: {
    minHeight: LARGE_TAP_TARGET,
    width: '100%',
    fontSize: tokens.fontSizeBase500,
  },
});

/** `/admin/event`: Finalize the event into the archive, then Export the file. */
export const AdminEventPage = observer(function AdminEventPage() {
  const vm = useViewModel((services) => new EventAdminViewModel(services.archive));
  const styles = useStyles();
  const page = usePageStyles();
  // Where the keyboard goes back to when the confirmation closes.
  const restoreFocusTarget = useRestoreFocusTarget();

  return (
    <div className={page.page}>
      <h1 className={page.title}>Event</h1>

      <section className={page.section} aria-labelledby="finalize-heading">
        <h2 id="finalize-heading" className={page.sectionTitle}>
          Finalize
        </h2>
        <p className={styles.text}>
          Saves this event&apos;s teams, members and scores as a frozen archive. Do it when the games are over. It can
          be repeated: each time replaces the archive.
        </p>
        <Button {...restoreFocusTarget} className={styles.button} appearance="primary" onClick={vm.askToFinalize}>
          Finalize the event
        </Button>
        {vm.finalizedText !== undefined && (
          <p className={styles.text} role="status">
            {vm.finalizedText}
          </p>
        )}
      </section>

      <section className={page.section} aria-labelledby="export-heading">
        <h2 id="export-heading" className={page.sectionTitle}>
          Export
        </h2>
        {vm.exportUrl === undefined ? (
          <p className={page.hint}>Finalize the event first, then the file can be downloaded here.</p>
        ) : (
          <>
            {/* A real link, so the browser downloads the file itself: it holds real names, and the app never touches it. */}
            <Button
              as="a"
              className={styles.button}
              appearance="secondary"
              href={vm.exportUrl}
              download={vm.exportFileName}
            >
              Download {vm.exportFileName}
            </Button>
            <p className={page.hint}>The file contains everyone&apos;s real names. Keep it somewhere private.</p>
          </>
        )}
      </section>

      {/* Always on the page; `vm.isConfirming` opens and closes it (see `FormDialog.open`). */}
      <FinalizeDialog vm={vm} />
    </div>
  );
});
