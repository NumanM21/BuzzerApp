import { MessageBar, MessageBarBody, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useViewModel } from '@/app/useViewModel';
import { Buzzer } from '@/components/Buzzer';
import { TeamQueue } from '@/components/TeamQueue';
import { usePageStyles } from '@/components/usePageStyles';
import { appTokens } from '@/theme/appTokens';
import { buzzerCopyKeys } from '@/theme/defaultCopy';
import { useCopy } from '@/theme/useThemePack';
import { PlayViewModel } from './PlayViewModel';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalL,
  },
  // The page's title for screen readers; sighted people see the buzzer and know where they are.
  title: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  notice: {
    alignSelf: 'stretch',
  },
  buzzedBy: {
    margin: 0,
    textAlign: 'center',
    overflowWrap: 'anywhere',
    color: appTokens.textMuted,
  },
  // The page centres its children (the buzzer); the queue takes the full width.
  queue: {
    alignSelf: 'stretch',
  },
});

/** The player's screen: the buzzer, what it means right now, and the team queue under it. */
export const PlayPage = observer(function PlayPage() {
  const vm = useViewModel((services) => new PlayViewModel(services.round, services.session, services.teams));
  const styles = useStyles();
  const page = usePageStyles();
  const copy = useCopy();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Buzz</h1>
      {vm.connectionNotice && (
        <MessageBar className={styles.notice} intent="warning">
          <MessageBarBody>{vm.connectionNotice}</MessageBarBody>
        </MessageBar>
      )}
      <Buzzer
        state={vm.state}
        teamColorKey={vm.teamColorKey}
        label={copy[buzzerCopyKeys[vm.state]]}
        sublabel={sublabelFor(vm)}
        disabled={!vm.canBuzz}
        onPress={() => void vm.buzz()}
      />
      {vm.buzzedBy !== undefined && <p className={styles.buzzedBy}>Buzzed in for your team by {vm.buzzedBy}</p>}
      {vm.error !== undefined && (
        <MessageBar className={styles.notice} intent="error">
          <MessageBarBody>{vm.error}</MessageBarBody>
        </MessageBar>
      )}
      {vm.queue.length > 0 && (
        <section className={mergeClasses(page.section, styles.queue)}>
          <h2 className={page.sectionTitle}>Team order</h2>
          <TeamQueue rows={vm.queue} />
        </section>
      )}
    </div>
  );
});

// Turning the view model's meaning into words is the view's job; the pack's flavour is on the main label.
function sublabelFor(vm: PlayViewModel): string | undefined {
  if (vm.isSent) {
    return 'Sent';
  }
  return vm.queuePosition === undefined ? undefined : `Number ${vm.queuePosition}`;
}
