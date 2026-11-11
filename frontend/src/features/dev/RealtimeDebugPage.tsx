import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import type { ReactNode } from 'react';
import { useViewModel } from '@/app/useViewModel';
import { appTokens } from '@/theme/appTokens';
import { RealtimeDebugViewModel } from './RealtimeDebugViewModel';
import { TAP_TARGET } from '@/components/sizes';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalL,
  },
  heading: {
    margin: 0,
    fontFamily: appTokens.fontHeading,
    fontSize: tokens.fontSizeBase600,
    lineHeight: tokens.lineHeightBase600,
  },
  facts: {
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    margin: 0,
  },
  value: {
    margin: 0,
    overflowWrap: 'anywhere',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  action: {
    minHeight: TAP_TARGET,
  },
  snapshot: {
    margin: 0,
    padding: tokens.spacingHorizontalM,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    backgroundColor: appTokens.surfacePanel,
  },
});

/** Dev only (`/dev/realtime`): the live connection's state, both snapshots as text, and the round's commands. */
export const RealtimeDebugPage = observer(function RealtimeDebugPage() {
  const vm = useViewModel((services) => new RealtimeDebugViewModel(services.round, services.session, services.clock));
  const styles = useStyles();

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Realtime</h1>
      <dl className={styles.facts}>
        <Fact label="Connection">{vm.connectionState}</Fact>
        <Fact label="Signed in as">{vm.identity}</Fact>
        <Fact label="Buzzer">{vm.buzzer}</Fact>
        <Fact label="Server clock offset">{vm.clockOffset}</Fact>
        <Fact label="Last command">{vm.lastResult ?? 'None yet'}</Fact>
      </dl>
      {vm.canBuzz && (
        <div className={styles.actions}>
          <Button className={styles.action} appearance="primary" disabled={vm.isSending} onClick={() => void vm.buzz()}>
            Buzz
          </Button>
        </div>
      )}
      <section>
        <h2 className={styles.heading}>Public snapshot</h2>
        <pre className={styles.snapshot}>{vm.publicSnapshot}</pre>
      </section>
      <section>
        <h2 className={styles.heading}>Admin snapshot</h2>
        <pre className={styles.snapshot}>{vm.adminSnapshot}</pre>
      </section>
    </main>
  );
});

function Fact({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <>
      <dt>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </>
  );
}
