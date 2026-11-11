import { makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useId } from 'react';
import { appTokens } from '@/theme/appTokens';
import { useTeamVisual } from '@/theme/useTeamVisual';
import { TAP_TARGET } from './sizes';

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
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
    margin: 0,
    padding: 0,
    ...shorthands.border('0', 'none', tokens.colorTransparentStroke),
  },
  legend: {
    paddingBottom: tokens.spacingVerticalXS,
    fontWeight: tokens.fontWeightSemibold,
  },
  options: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 9rem), 1fr))',
    gap: tokens.spacingHorizontalS,
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    minHeight: TAP_TARGET,
    padding: tokens.spacingHorizontalS,
    cursor: 'pointer',
    backgroundColor: appTokens.surfacePanel,
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
    borderRadius: tokens.borderRadiusMedium,
    ':focus-within': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  // Chosen is shown by the filled radio, a heavier label and the shadow, never by colour alone.
  optionSelected: {
    boxShadow: appTokens.shadow,
    fontWeight: tokens.fontWeightBold,
  },
  radio: {
    flexShrink: 0,
    width: '20px',
    height: '20px',
    margin: 0,
  },
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
  error: {
    margin: 0,
    color: tokens.colorPaletteRedForeground1,
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
  const styles = useStyles();
  const groupName = useId();
  const errorId = useId();

  return (
    <fieldset className={styles.group} aria-describedby={errorText ? errorId : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options}>
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
      </div>
      {errorText && (
        <p id={errorId} className={styles.error}>
          {errorText}
        </p>
      )}
    </fieldset>
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
    <label className={mergeClasses(styles.option, selected && styles.optionSelected)} style={{ '--team-fill': visual.fill }}>
      <input
        className={styles.radio}
        type="radio"
        name={groupName}
        checked={selected}
        onChange={() => onSelect(optionKey)}
      />
      {kind === 'color' ? (
        <span className={styles.swatch} aria-hidden />
      ) : (
        <span className={styles.iconBox}>
          {/* Decorative: the key written next to it names the icon. */}
          <img className={styles.icon} src={visual.iconUrl} alt="" />
        </span>
      )}
      <span className={styles.label}>{optionKey.replaceAll('-', ' ')}</span>
    </label>
  );
});
