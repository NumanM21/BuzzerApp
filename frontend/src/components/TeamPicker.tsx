import { makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useId } from 'react';
import { appTokens } from '@/theme/appTokens';
import { useTeamVisual } from '@/theme/useTeamVisual';

export interface TeamPickerOption {
  id: number;
  name: string;
  colorKey: string;
  iconKey: string;
  /** For example "3 players", already worded by the view model. */
  detail: string;
}

export interface TeamPickerProps {
  legend: string;
  options: readonly TeamPickerOption[];
  selectedId: number | undefined;
  onSelect: (teamId: number) => void;
  /** Shown under the options and tied to the group for screen readers. */
  errorText?: string;
}

const iconWidth = '42px';
const iconHeight = '33px';

const useStyles = makeStyles({
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
    margin: 0,
    padding: 0,
    // A fieldset draws a box by default; the cards inside are the visible structure.
    ...shorthands.border('0', 'none', tokens.colorTransparentStroke),
  },
  legend: {
    paddingBottom: tokens.spacingVerticalXS,
    fontWeight: tokens.fontWeightSemibold,
  },
  // One column on a phone; as many as fit on a wider screen. Nothing assumes a number of teams.
  options: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 16rem), 1fr))',
    gap: tokens.spacingHorizontalS,
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    minHeight: '56px',
    padding: tokens.spacingHorizontalS,
    cursor: 'pointer',
    backgroundColor: appTokens.surfacePanel,
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, 'var(--team-fill)'),
    borderRadius: tokens.borderRadiusMedium,
    // The whole card is the target, and keyboard focus on its hidden-away radio shows on the card.
    ':focus-within': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  // Chosen is shown by a heavier name and the filled radio, never by colour alone.
  optionSelected: {
    boxShadow: appTokens.shadow,
  },
  radio: {
    flexShrink: 0,
    width: '22px',
    height: '22px',
    margin: 0,
  },
  iconBox: {
    flexShrink: 0,
    width: iconWidth,
    height: iconHeight,
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
  texts: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    // A 24-character team name must wrap rather than push the card wider than a phone.
    overflowWrap: 'anywhere',
  },
  name: {
    fontFamily: appTokens.fontHeading,
  },
  nameSelected: {
    fontWeight: tokens.fontWeightBold,
  },
  detail: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: appTokens.textMuted,
  },
  error: {
    margin: 0,
    color: tokens.colorPaletteRedForeground1,
  },
});

/** Radio cards for choosing one team: colour, icon, name and head count. Works for one team or thirteen. */
export const TeamPicker = observer(function TeamPicker({
  legend,
  options,
  selectedId,
  onSelect,
  errorText,
}: TeamPickerProps) {
  const styles = useStyles();
  const groupName = useId();
  const errorId = useId();

  return (
    <fieldset className={styles.group} aria-describedby={errorText ? errorId : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <PickerOption
            key={option.id}
            option={option}
            groupName={groupName}
            selected={option.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
      {errorText && (
        <p id={errorId} className={styles.error}>
          {errorText}
        </p>
      )}
    </fieldset>
  );
});

interface PickerOptionProps {
  option: TeamPickerOption;
  groupName: string;
  selected: boolean;
  onSelect: (teamId: number) => void;
}

const PickerOption = observer(function PickerOption({ option, groupName, selected, onSelect }: PickerOptionProps) {
  const styles = useStyles();
  const visual = useTeamVisual(option.colorKey, option.iconKey);

  return (
    <label className={mergeClasses(styles.option, selected && styles.optionSelected)} style={{ '--team-fill': visual.fill }}>
      <input
        className={styles.radio}
        type="radio"
        name={groupName}
        checked={selected}
        onChange={() => onSelect(option.id)}
      />
      <span className={styles.iconBox}>
        {/* Decorative: the name next to it says which team this is. */}
        <img className={styles.icon} src={visual.iconUrl} alt="" />
      </span>
      <span className={styles.texts}>
        <span className={mergeClasses(styles.name, selected && styles.nameSelected)}>{option.name}</span>
        <span className={styles.detail}>{option.detail}</span>
      </span>
    </label>
  );
});
