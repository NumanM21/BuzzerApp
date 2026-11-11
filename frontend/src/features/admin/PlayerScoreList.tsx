import { Radio, RadioGroup, Spinner, makeStyles, shorthands, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { appTokens } from '@/theme/appTokens';
import { useFormatScore } from '@/theme/useThemePack';
import type { AdminScoresViewModel } from './AdminScoresViewModel';
import { TAP_TARGET } from '@/components/sizes';

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  note: {
    margin: 0,
    color: appTokens.textMuted,
  },
  sort: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
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
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
    borderRadius: tokens.borderRadiusMedium,
  },
  names: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
    // A 20-character name in a wide font wraps rather than widening the page.
    overflowWrap: 'anywhere',
  },
  small: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: appTokens.textMuted,
  },
  total: {
    flexShrink: 0,
    fontFamily: appTokens.fontNumeric,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
  },
});

/** Every player's own score, sorted by team or by score. These points never count towards the team's total (D25). */
export const PlayerScoreList = observer(function PlayerScoreList({ vm }: { vm: AdminScoresViewModel }) {
  const styles = useStyles();
  const formatScore = useFormatScore();

  return (
    <div className={styles.section}>
      <p className={styles.note}>Players&apos; own points. They are kept apart from the team totals.</p>

      {vm.playerState === 'loading' && <Spinner label="Loading the players" />}
      {vm.playerState === 'empty' && <p className={styles.note}>No players have joined yet.</p>}
      {vm.playerState === 'ready' && (
        <>
          <RadioGroup
            className={styles.sort}
            layout="horizontal"
            aria-label="Sort players by"
            value={vm.sortMode}
            onChange={(_, data) => vm.setSortMode(data.value)}
          >
            {vm.sortOptions.map((option) => (
              <Radio key={option.value} value={option.value} label={`Sort by ${option.label}`} />
            ))}
          </RadioGroup>
          <ul className={styles.list}>
            {vm.playerRows.map((row) => (
              <li key={row.id} className={styles.row}>
                <span className={styles.names}>
                  <span>{row.displayName}</span>
                  <span className={styles.small}>
                    {row.realName} · {row.teamName ?? 'No team'}
                  </span>
                </span>
                <span className={styles.total}>{formatScore(row.total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
});
