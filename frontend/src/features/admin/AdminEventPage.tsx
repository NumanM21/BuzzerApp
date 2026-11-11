import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useViewModel } from '@/app/useViewModel';
import { appTokens } from '@/theme/appTokens';
import { EventAdminViewModel } from './EventAdminViewModel';
import { FinalizeDialog } from './FinalizeDialog';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  heading: {
    margin: 0,
    fontFamily: appTokens.fontHeading,
    // Explicit, or the browser's 1.5em default outgrows the inherited line height and a wrapped heading overlaps itself.
    fontSize: tokens.fontSizeBase600,
    lineHeight: tokens.lineHeightBase600,
  },
  sectionHeading: {
    margin: 0,
    fontFamily: appTokens.fontHeading,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  text: {
    margin: 0,
    overflowWrap: 'anywhere',
  },
  hint: {
    margin: 0,
    color: appTokens.textMuted,
    overflowWrap: 'anywhere',
  },
  button: {
    minHeight: '64px',
    width: '100%',
    fontSize: tokens.fontSizeBase500,
  },
});

/** `/admin/event`: Finalize the event into the archive, then Export the file. */
export const AdminEventPage = observer(function AdminEventPage() {
  const vm = useViewModel((services) => new EventAdminViewModel(services.archive));
  const styles = useStyles();

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Event</h1>

      <section className={styles.section} aria-labelledby="finalize-heading">
        <h2 id="finalize-heading" className={styles.sectionHeading}>
          Finalize
        </h2>
        <p className={styles.text}>
          Saves this event&apos;s teams, members and scores as a frozen archive. Do it when the games are over. It can
          be repeated: each time replaces the archive.
        </p>
        <Button className={styles.button} appearance="primary" onClick={vm.askToFinalize}>
          Finalize the event
        </Button>
        {vm.finalizedText !== undefined && (
          <p className={styles.text} role="status">
            {vm.finalizedText}
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="export-heading">
        <h2 id="export-heading" className={styles.sectionHeading}>
          Export
        </h2>
        {vm.exportUrl === undefined ? (
          <p className={styles.hint}>Finalize the event first, then the file can be downloaded here.</p>
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
            <p className={styles.hint}>The file contains everyone&apos;s real names. Keep it somewhere private.</p>
          </>
        )}
      </section>

      {vm.isConfirming && <FinalizeDialog vm={vm} />}
    </div>
  );
});
