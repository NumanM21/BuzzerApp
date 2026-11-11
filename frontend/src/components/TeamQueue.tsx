import { makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import type { QueueRow } from '@/domain/queueRows';
import type { TeamTurnStatus } from '@/domain/round';
import { appTokens } from '@/theme/appTokens';
import { useTeamVisual } from '@/theme/useTeamVisual';
import { useCopy } from '@/theme/useThemePack';

export interface TeamQueueProps {
  /** In buzz order, as the server sent them. */
  rows: readonly QueueRow[];
}

// Each state is a word as well as a look: colour is never the only signal.
const statusText: Record<TeamTurnStatus, string> = {
  current: 'Answering',
  waiting: 'Waiting',
  passed: 'Out',
};

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minHeight: '44px',
    padding: tokens.spacingHorizontalS,
    backgroundColor: appTokens.surfacePanel,
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, 'var(--team-fill)'),
    borderRadius: tokens.borderRadiusMedium,
  },
  current: {
    fontWeight: tokens.fontWeightBold,
    boxShadow: appTokens.shadow,
  },
  position: {
    flexShrink: 0,
    minWidth: '2ch',
    textAlign: 'center',
    fontFamily: appTokens.fontNumeric,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
  },
  iconBox: {
    flexShrink: 0,
    width: '40px',
    height: '32px',
    backgroundColor: 'var(--team-fill)',
    borderRadius: tokens.borderRadiusSmall,
    overflow: 'hidden',
  },
  icon: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  names: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
    // The longest team and display names wrap instead of clipping or widening the page.
    overflowWrap: 'anywhere',
  },
  teamName: {
    fontFamily: appTokens.fontHeading,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
  buzzedBy: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: appTokens.textMuted,
  },
  status: {
    flexShrink: 0,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
});

/** The teams that have buzzed, in the order the server put them: place, team, who buzzed for it, and its turn. */
export const TeamQueue = observer(function TeamQueue({ rows }: TeamQueueProps) {
  const styles = useStyles();
  return (
    <ol className={styles.list}>
      {rows.map((row) => (
        <QueueItem key={row.teamId} row={row} />
      ))}
    </ol>
  );
});

const QueueItem = observer(function QueueItem({ row }: { row: QueueRow }) {
  const styles = useStyles();
  const copy = useCopy();
  const visual = useTeamVisual(row.colorKey, row.iconKey);

  return (
    <li
      className={mergeClasses(styles.row, row.status === 'current' && styles.current)}
      style={{ '--team-fill': visual.fill }}
    >
      <span className={styles.position}>{row.position}</span>
      <span className={styles.iconBox}>
        {/* Decorative: the team name next to it says which team this is. */}
        <img className={styles.icon} src={visual.iconUrl} alt="" />
      </span>
      <span className={styles.names}>
        <span className={styles.teamName}>
          {row.teamName}
          {row.isMine && ` (${copy.teamYou})`}
        </span>
        <span className={styles.buzzedBy}>Buzzed by {row.buzzedBy}</span>
      </span>
      <span className={styles.status}>{statusText[row.status]}</span>
    </li>
  );
});
