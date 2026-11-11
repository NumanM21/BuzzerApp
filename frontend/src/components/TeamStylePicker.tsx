import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useId } from 'react';
import { useTeamVisual } from '@/theme/useTeamVisual';
import { RadioCard, RadioCardGroup } from './RadioCards';

export interface TeamStylePickerProps {
  legend: string;
  kind: 'color' | 'icon';
  /** The pack's keys on offer, in the order to show them. */
  keys: readonly string[];
  selectedKey: string | undefined;
  /** For icons: the colour to draw them on, so the choice looks like the finished card. */
  previewColorKey?: string;
  onSelect: (key: string) => void;
  /** Shown under the options and tied to the group for screen readers. */
  errorText?: string;
}

const useStyles = makeStyles({
  swatch: {
    flexShrink: 0,
    width: '32px',
    height: '32px',
    backgroundColor: 'var(--team-fill)',
    borderRadius: tokens.borderRadiusSmall,
  },
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
  label: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  labelSelected: {
    fontWeight: tokens.fontWeightBold,
  },
});

/**
 * Radio cards for choosing one colour or one icon of the active pack, for the "Add team" dialog. Every option carries
 * its key as text, so the choice never rests on colour alone. Works for one key or for dozens.
 */
export const TeamStylePicker = observer(function TeamStylePicker({
  legend,
  kind,
  keys,
  selectedKey,
  previewColorKey,
  onSelect,
  errorText,
}: TeamStylePickerProps) {
  const groupName = useId();

  return (
    <RadioCardGroup legend={legend} density="compact" errorText={errorText}>
      {keys.map((key) => (
        <StyleOption
          key={key}
          kind={kind}
          optionKey={key}
          previewColorKey={previewColorKey}
          groupName={groupName}
          selected={key === selectedKey}
          onSelect={onSelect}
        />
      ))}
    </RadioCardGroup>
  );
});

interface StyleOptionProps {
  kind: 'color' | 'icon';
  optionKey: string;
  previewColorKey: string | undefined;
  groupName: string;
  selected: boolean;
  onSelect: (key: string) => void;
}

const StyleOption = observer(function StyleOption({
  kind,
  optionKey,
  previewColorKey,
  groupName,
  selected,
  onSelect,
}: StyleOptionProps) {
  const styles = useStyles();
  // A colour option draws the colour; an icon option draws the icon on the colour chosen so far.
  const visual = useTeamVisual(kind === 'color' ? optionKey : (previewColorKey ?? ''), kind === 'icon' ? optionKey : '');

  return (
    <RadioCard
      groupName={groupName}
      selected={selected}
      onSelect={() => onSelect(optionKey)}
      teamFill={visual.fill}
      frame="neutral"
      density="compact"
    >
      {kind === 'color' ? (
        <span className={styles.swatch} aria-hidden />
      ) : (
        <span className={styles.iconBox}>
          {/* Decorative: the key written next to it names the icon. */}
          <img className={styles.icon} src={visual.iconUrl} alt="" />
        </span>
      )}
      <span className={mergeClasses(styles.label, selected && styles.labelSelected)}>
        {optionKey.replaceAll('-', ' ')}
      </span>
    </RadioCard>
  );
});
