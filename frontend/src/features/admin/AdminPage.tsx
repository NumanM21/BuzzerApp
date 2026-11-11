import {
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useViewModel } from '@/app/useViewModel';
import { TeamQueue } from '@/components/TeamQueue';
import { usePageStyles } from '@/components/usePageStyles';
import { appTokens } from '@/theme/appTokens';
import { HostViewModel } from './HostViewModel';
import { LARGE_TAP_TARGET } from '@/components/sizes';

const useStyles = makeStyles({
  phase: {
    margin: 0,
    fontFamily: appTokens.fontHeading,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    overflowWrap: 'anywhere',
  },
  // The host's buttons are the biggest things on this screen: one per row, easy to hit without looking.
  buttons: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  button: {
    minHeight: LARGE_TAP_TARGET,
    width: '100%',
    fontSize: tokens.fontSizeBase500,
  },
  answering: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    backgroundColor: appTokens.surfacePanel,
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
    overflowWrap: 'anywhere',
  },
  stopwatch: {
    fontFamily: appTokens.fontNumeric,
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
  },
  buzzList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  buzz: {
    minHeight: '32px',
    overflowWrap: 'anywhere',
  },
  notCounted: {
    color: appTokens.textMuted,
  },
});

/**
 * `/admin`, the host's screen: run a round from a phone. The buttons, queue, stopwatch and buzz list all show what
 * the admin snapshot says; the page decides nothing.
 */
export const AdminPage = observer(function AdminPage() {
  const vm = useViewModel((services) => new HostViewModel(services.round, services.clock, services.teams));
  const styles = useStyles();
  const page = usePageStyles();

  return (
    <div className={page.page}>
      <h1 className={page.title}>Host</h1>

      {vm.isConnecting ? (
        <Spinner label={vm.connectionNotice ?? 'Waiting for the first update from the game…'} />
      ) : (
        <>
          {vm.connectionNotice !== undefined && (
            <MessageBar intent="warning">
              <MessageBarBody>{vm.connectionNotice}</MessageBarBody>
            </MessageBar>
          )}
          <p className={styles.phase} role="status">
            {vm.phaseText}
          </p>
        </>
      )}

      <div className={styles.buttons} aria-busy={vm.isSending}>
        {vm.buttons.map((button) => (
          <Button
            key={button.action}
            className={styles.button}
            appearance={button.action === 'beginRound' ? 'primary' : 'secondary'}
            disabled={!button.enabled}
            onClick={() => void vm.run(button.action)}
          >
            {button.label}
          </Button>
        ))}
      </div>

      {vm.error !== undefined && (
        <MessageBar intent="warning">
          <MessageBarBody>{vm.error}</MessageBarBody>
        </MessageBar>
      )}

      {vm.answering !== undefined && (
        <section className={styles.answering} aria-labelledby="answering-heading">
          <h2 id="answering-heading" className={page.sectionTitle}>
            Answering now
          </h2>
          <span>
            {vm.answering.teamName}, buzzed in by {vm.answering.buzzedBy}
          </span>
          {/* `role="timer"` is not announced as it changes, which a ten-per-second stopwatch must not be. */}
          <span className={styles.stopwatch} role="timer" aria-label="Time answering">
            {vm.answering.elapsed}
          </span>
        </section>
      )}

      {!vm.isConnecting && (
        <>
          <section className={page.section} aria-labelledby="queue-heading">
            <h2 id="queue-heading" className={page.sectionTitle}>
              Team order
            </h2>
            {vm.queue.length === 0 ? <p className={page.hint}>No team has buzzed yet.</p> : <TeamQueue rows={vm.queue} />}
          </section>

          <section className={page.section} aria-labelledby="buzzes-heading">
            <h2 id="buzzes-heading" className={page.sectionTitle}>
              Every buzz
            </h2>
            {vm.buzzes.length === 0 ? (
              <p className={page.hint}>No buzzes yet.</p>
            ) : (
              <ol className={styles.buzzList}>
                {vm.buzzes.map((buzz) => (
                  <li key={buzz.sequence} className={mergeClasses(styles.buzz, !buzz.counted && styles.notCounted)}>
                    {buzz.text}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
});
