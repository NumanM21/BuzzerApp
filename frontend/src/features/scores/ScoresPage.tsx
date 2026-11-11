import { Button, MessageBar, MessageBarActions, MessageBarBody, Spinner } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useViewModel } from '@/app/useViewModel';
import { TeamScoreList } from '@/components/TeamScoreList';
import { usePageStyles } from '@/components/usePageStyles';
import { LeaderboardViewModel } from './LeaderboardViewModel';

/** `/scores`: the team leaderboard, kept current by the hub. */
export const ScoresPage = observer(function ScoresPage() {
  const vm = useViewModel((services) => new LeaderboardViewModel(services.scores, services.session));
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

      {vm.state === 'loading' && <Spinner label="Loading the scores" />}
      {vm.state === 'empty' && <p className={page.hint}>There are no teams yet.</p>}
      {vm.state === 'ready' && <TeamScoreList rows={vm.rows} />}
    </div>
  );
});
