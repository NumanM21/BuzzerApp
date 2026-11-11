import { Button, MessageBar, MessageBarActions, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useViewModel } from '@/app/useViewModel';
import { TeamScoreList } from '@/components/TeamScoreList';
import { appTokens } from '@/theme/appTokens';
import { LeaderboardViewModel } from './LeaderboardViewModel';

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
  hint: {
    margin: 0,
    color: appTokens.textMuted,
  },
});

/** `/scores`: the team leaderboard, kept current by the hub. */
export const ScoresPage = observer(function ScoresPage() {
  const vm = useViewModel((services) => new LeaderboardViewModel(services.scores, services.session));
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

      {vm.state === 'loading' && <Spinner label="Loading the scores" />}
      {vm.state === 'empty' && <p className={styles.hint}>There are no teams yet.</p>}
      {vm.state === 'ready' && <TeamScoreList rows={vm.rows} />}
    </div>
  );
});
