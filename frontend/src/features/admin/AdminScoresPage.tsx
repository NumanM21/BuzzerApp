import { Button, MessageBar, MessageBarActions, MessageBarBody, Spinner } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useViewModel } from '@/app/useViewModel';
import { TeamScoreList } from '@/components/TeamScoreList';
import { usePageStyles } from '@/components/usePageStyles';
import { AdjustmentEntryForm } from './AdjustmentEntryForm';
import { AdminScoresViewModel } from './AdminScoresViewModel';
import { PlayerScoreList } from './PlayerScoreList';
import { RecentAdjustments } from './RecentAdjustments';

/**
 * `/admin/scores`: standings on top, then the form that changes them, the newest changes with Undo, and last every
 * player's own score (the longest list, so it can't push the rest out of reach).
 */
export const AdminScoresPage = observer(function AdminScoresPage() {
  const vm = useViewModel((services) => new AdminScoresViewModel(services.scores, services.teams));
  const page = usePageStyles();

  return (
    <div className={page.page}>
      <h1 className={page.title}>Scores</h1>

      {vm.loadError !== undefined && (
        <MessageBar intent="error">
          <MessageBarBody>{vm.loadError}</MessageBarBody>
          <MessageBarActions>
            <Button onClick={vm.reload}>Try again</Button>
          </MessageBarActions>
        </MessageBar>
      )}

      <section className={page.section} aria-labelledby="standings-heading">
        <h2 id="standings-heading" className={page.sectionTitle}>
          Team standings
        </h2>
        {vm.teamState === 'loading' && <Spinner label="Loading the standings" />}
        {vm.teamState === 'empty' && <p className={page.hint}>There are no teams yet.</p>}
        {vm.teamState === 'ready' && <TeamScoreList rows={vm.teamRows} />}
      </section>

      <section className={page.section} aria-labelledby="entry-heading">
        <h2 id="entry-heading" className={page.sectionTitle}>
          Add or remove points
        </h2>
        <AdjustmentEntryForm vm={vm.entry} />
      </section>

      <section className={page.section} aria-labelledby="recent-heading">
        <h2 id="recent-heading" className={page.sectionTitle}>
          Recent changes
        </h2>
        <RecentAdjustments vm={vm.recent} />
      </section>

      <section className={page.section} aria-labelledby="players-heading">
        <h2 id="players-heading" className={page.sectionTitle}>
          Players
        </h2>
        <PlayerScoreList vm={vm} />
      </section>
    </div>
  );
});
