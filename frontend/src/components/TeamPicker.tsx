import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useId } from 'react';
import { appTokens } from '@/theme/appTokens';
import { useTeamVisual } from '@/theme/useTeamVisual';
import { RadioCard, RadioCardGroup } from './RadioCards';

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

const useStyles = makeStyles({
  iconBox: {
    flexShrink: 0,
    width: '42px',
    height: '33px',
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
});

/** Radio cards for choosing one team: colour, icon, name and head count. Works for one team or thirteen. */
export const TeamPicker = observer(function TeamPicker({
  legend,
  options,
  selectedId,
  onSelect,
  errorText,
}: TeamPickerProps) {
  const groupName = useId();

  return (
    <RadioCardGroup legend={legend} density="roomy" errorText={errorText}>
      {options.map((option) => (
        <PickerOption
          key={option.id}
          option={option}
          groupName={groupName}
          selected={option.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </RadioCardGroup>
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
    <RadioCard
      groupName={groupName}
      selected={selected}
      onSelect={() => onSelect(option.id)}
      teamFill={visual.fill}
      frame="team"
      density="roomy"
    >
      <span className={styles.iconBox}>
        {/* Decorative: the name next to it says which team this is. */}
        <img className={styles.icon} src={visual.iconUrl} alt="" />
      </span>
      <span className={styles.texts}>
        <span className={mergeClasses(styles.name, selected && styles.nameSelected)}>{option.name}</span>
        <span className={styles.detail}>{option.detail}</span>
      </span>
    </RadioCard>
  );
});
