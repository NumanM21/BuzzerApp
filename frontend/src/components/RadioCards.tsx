import { makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import { useId, type ReactNode } from 'react';
import { appTokens } from '@/theme/appTokens';
import { TAP_TARGET } from './sizes';

/** `roomy` cards hold a name and a detail line (a team); `compact` ones a single short label (a colour, an icon). */
export type RadioCardDensity = 'roomy' | 'compact';

export interface RadioCardGroupProps {
  legend: string;
  density: RadioCardDensity;
  /** Shown under the cards and tied to the group for screen readers. */
  errorText?: string;
  /** The group's `RadioCard`s. */
  children: ReactNode;
}

export interface RadioCardProps {
  /** The same for every card of one group (from `useId`), so the browser treats them as one set of radios. */
  groupName: string;
  selected: boolean;
  onSelect: () => void;
  /** The team colour the card draws with; its content can use it as `var(--team-fill)`. */
  teamFill: string;
  /** Frame the card in the team colour (the card is a team) or in the neutral panel border (a colour or icon). */
  frame: 'team' | 'neutral';
  density: RadioCardDensity;
  children: ReactNode;
}

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
  // One column on a phone; as many as fit on a wider screen. Nothing assumes a number of cards.
  cards: {
    display: 'grid',
    gap: tokens.spacingHorizontalS,
  },
  cardsRoomy: {
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 16rem), 1fr))',
  },
  cardsCompact: {
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 9rem), 1fr))',
  },
  error: {
    margin: 0,
    color: tokens.colorPaletteRedForeground1,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    padding: tokens.spacingHorizontalS,
    cursor: 'pointer',
    backgroundColor: appTokens.surfacePanel,
    borderRadius: tokens.borderRadiusMedium,
    // The whole card is the target, and keyboard focus on its radio shows on the card.
    ':focus-within': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  cardRoomy: {
    gap: tokens.spacingHorizontalM,
    minHeight: '56px',
  },
  cardCompact: {
    gap: tokens.spacingHorizontalS,
    minHeight: TAP_TARGET,
  },
  frameTeam: {
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, 'var(--team-fill)'),
  },
  frameNeutral: {
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
  },
  // Chosen is shown by the filled radio and this shadow (and the card's own heavier text), never by colour alone.
  cardSelected: {
    boxShadow: appTokens.shadow,
  },
  radio: {
    flexShrink: 0,
    margin: 0,
  },
  radioRoomy: {
    width: '22px',
    height: '22px',
  },
  radioCompact: {
    width: '20px',
    height: '20px',
  },
});

/**
 * The frame of a "pick one" set of cards: a named group (so the arrow keys move between the cards and a screen
 * reader announces what is being chosen), a grid that reflows from one column to many, and the error line.
 */
export const RadioCardGroup = observer(function RadioCardGroup({
  legend,
  density,
  errorText,
  children,
}: RadioCardGroupProps) {
  const styles = useStyles();
  const errorId = useId();

  return (
    <fieldset className={styles.group} aria-describedby={errorText ? errorId : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={mergeClasses(styles.cards, density === 'roomy' ? styles.cardsRoomy : styles.cardsCompact)}>
        {children}
      </div>
      {errorText && (
        <p id={errorId} className={styles.error}>
          {errorText}
        </p>
      )}
    </fieldset>
  );
});

/** One choice: a real radio button and whatever describes the choice, all of it one tap target. */
export const RadioCard = observer(function RadioCard({
  groupName,
  selected,
  onSelect,
  teamFill,
  frame,
  density,
  children,
}: RadioCardProps) {
  const styles = useStyles();
  const roomy = density === 'roomy';

  return (
    <label
      className={mergeClasses(
        styles.card,
        roomy ? styles.cardRoomy : styles.cardCompact,
        frame === 'team' ? styles.frameTeam : styles.frameNeutral,
        selected && styles.cardSelected,
      )}
      style={{ '--team-fill': teamFill }}
    >
      <input
        className={mergeClasses(styles.radio, roomy ? styles.radioRoomy : styles.radioCompact)}
        type="radio"
        name={groupName}
        checked={selected}
        onChange={onSelect}
      />
      {children}
    </label>
  );
});
