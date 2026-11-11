import { Button, MessageBar, MessageBarActions, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useViewModel } from '@/app/useViewModel';
import { TeamScoreList } from '@/components/TeamScoreList';
import { appTokens } from '@/theme/appTokens';
import { AdjustmentEntryForm } from './AdjustmentEntryForm';
import { AdminScoresViewModel } from './AdminScoresViewModel';
import { PlayerScoreList } from './PlayerScoreList';
import { RecentAdjustments } from './RecentAdjustments';

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
  hint: {
    margin: 0,
    color: appTokens.textMuted,
  },
});

/**
 * `/admin/scores`: standings on top, then the form that changes them, the newest changes with Undo, and last every
 * player's own score (the longest list, so it can't push the rest out of reach).
 */
export const AdminScoresPage = observer(function AdminScoresPage() {
  const vm = useViewModel((services) => new AdminScoresViewModel(services.scores, services.teams));
  const styles = useStyles();

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Scores</h1>

      {vm.loadError !== undefined && (
        <MessageBar intent="error">
          <MessageBarBody>{vm.loadError}</MessageBarBody>
          <MessageBarActions>
            <Button onClick={vm.reload}>Try again</Button>
          </MessageBarActions>
        </MessageBar>
      )}

      <section className={styles.section} aria-labelledby="standings-heading">
        <h2 id="standings-heading" className={styles.sectionHeading}>
          Team standings
        </h2>
        {vm.teamState === 'loading' && <Spinner label="Loading the standings" />}
        {vm.teamState === 'empty' && <p className={styles.hint}>There are no teams yet.</p>}
        {vm.teamState === 'ready' && <TeamScoreList rows={vm.teamRows} />}
      </section>

      <section className={styles.section} aria-labelledby="entry-heading">
        <h2 id="entry-heading" className={styles.sectionHeading}>
          Add or remove points
        </h2>
        <AdjustmentEntryForm vm={vm.entry} />
      </section>

      <section className={styles.section} aria-labelledby="recent-heading">
        <h2 id="recent-heading" className={styles.sectionHeading}>
          Recent changes
        </h2>
        <RecentAdjustments vm={vm.recent} />
      </section>

      <section className={styles.section} aria-labelledby="players-heading">
        <h2 id="players-heading" className={styles.sectionHeading}>
          Players
        </h2>
        <PlayerScoreList vm={vm} />
      </section>
    </div>
  );
});
