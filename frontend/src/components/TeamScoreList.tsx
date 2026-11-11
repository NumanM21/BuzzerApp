import { makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import type { TeamScoreRow } from '@/domain/scoreRows';
import { appTokens } from '@/theme/appTokens';
import { useTeamVisual } from '@/theme/useTeamVisual';
import { useCopy, useFormatScore } from '@/theme/useThemePack';
import { TAP_TARGET } from './sizes';

export interface TeamScoreListProps {
  /** In the server's order, with the server's ranks. */
  rows: readonly TeamScoreRow[];
}

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
    minHeight: TAP_TARGET,
    padding: tokens.spacingHorizontalS,
    backgroundColor: appTokens.surfacePanel,
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, 'var(--team-fill)'),
    borderRadius: tokens.borderRadiusMedium,
  },
  rank: {
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
  name: {
    flexGrow: 1,
    minWidth: 0,
    fontFamily: appTokens.fontHeading,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    // The longest team name wraps instead of clipping or widening the page.
    overflowWrap: 'anywhere',
  },
  mine: {
    fontWeight: tokens.fontWeightBold,
  },
  total: {
    flexShrink: 0,
    fontFamily: appTokens.fontNumeric,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
  },
});

/**
 * Teams with their rank and total, one line each. Shared by the leaderboard and the admin's scoring screen. Equal totals
 * show the same rank number, as the server sent it.
 */
export const TeamScoreList = observer(function TeamScoreList({ rows }: TeamScoreListProps) {
  const styles = useStyles();
  return (
    <ol className={styles.list}>
      {rows.map((row) => (
        <TeamScoreItem key={row.teamId} row={row} />
      ))}
    </ol>
  );
});

const TeamScoreItem = observer(function TeamScoreItem({ row }: { row: TeamScoreRow }) {
  const styles = useStyles();
  const copy = useCopy();
  const visual = useTeamVisual(row.colorKey, row.iconKey);
  const formatScore = useFormatScore();

  return (
    <li className={styles.row} style={{ '--team-fill': visual.fill }}>
      <span className={styles.rank}>{row.rank}</span>
      <span className={styles.iconBox}>
        {/* Decorative: the team name next to it says which team this is. */}
        <img className={styles.icon} src={visual.iconUrl} alt="" />
      </span>
      <span className={mergeClasses(styles.name, row.isMine && styles.mine)}>
        {row.name}
        {row.isMine && ` (${copy.teamYou})`}
      </span>
      <span className={styles.total}>{formatScore(row.total)}</span>
    </li>
  );
});
