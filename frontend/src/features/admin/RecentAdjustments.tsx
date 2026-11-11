import { Button, MessageBar, MessageBarActions, MessageBarBody, Spinner, makeStyles, shorthands, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { formatSignedPoints } from '@/domain/scoreEntry';
import { appTokens } from '@/theme/appTokens';
import type { RecentAdjustmentsViewModel } from './RecentAdjustmentsViewModel';

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
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
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
    borderRadius: tokens.borderRadiusMedium,
  },
  amount: {
    flexShrink: 0,
    minWidth: '5ch',
    fontFamily: appTokens.fontNumeric,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  target: {
    fontWeight: tokens.fontWeightSemibold,
  },
  small: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: appTokens.textMuted,
  },
  undoButton: {
    flexShrink: 0,
    minHeight: '44px',
  },
  hint: {
    margin: 0,
    color: appTokens.textMuted,
  },
});

const targetKindText = { team: 'Team', player: 'Player' } as const;

/** The newest changes, newest first, each with what it did, who did it and an Undo where one is allowed. */
export const RecentAdjustments = observer(function RecentAdjustments({ vm }: { vm: RecentAdjustmentsViewModel }) {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      {vm.loadError !== undefined && (
        <MessageBar intent="error">
          <MessageBarBody>{vm.loadError}</MessageBarBody>
          <MessageBarActions>
            <Button onClick={vm.reload}>Try again</Button>
          </MessageBarActions>
        </MessageBar>
      )}
      {vm.undoError !== undefined && (
        <MessageBar intent="error">
          <MessageBarBody>{vm.undoError}</MessageBarBody>
        </MessageBar>
      )}

      {vm.state === 'loading' && <Spinner label="Loading the recent changes" />}
      {vm.state === 'empty' && <p className={styles.hint}>No points have been added or removed yet.</p>}
      {vm.state === 'ready' && (
        <ul className={styles.list}>
          {vm.rows.map((row) => {
            const signed = formatSignedPoints(row.amount);
            return (
              <li key={row.id} className={styles.row}>
                <span className={styles.amount}>{signed}</span>
                <span className={styles.details}>
                  <span className={styles.target}>
                    {targetKindText[row.targetKind]}: {row.targetName}
                  </span>
                  {row.reason !== null && <span>{row.reason}</span>}
                  <span className={styles.small}>
                    {row.createdBy}
                    {row.time !== '' && ` · ${row.time}`}
                  </span>
                  {row.isUndo && <span className={styles.small}>Undoes an earlier change</span>}
                  {row.undo === 'alreadyUndone' && <span className={styles.small}>Undone</span>}
                </span>
                {row.undo === 'available' && (
                  <Button
                    className={styles.undoButton}
                    aria-label={`Undo ${signed} for ${row.targetName}`}
                    disabled={vm.isUndoing}
                    onClick={() => void vm.undo(row.id)}
                  >
                    {vm.undoingId === row.id ? 'Undoing…' : 'Undo'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
