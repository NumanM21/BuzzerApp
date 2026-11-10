import { makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import type { MouseEvent, PointerEvent } from 'react';
import type { BuzzerVisualState } from '@/domain/buzzer';
import { appTokens } from '@/theme/appTokens';
import { useTeamVisual } from '@/theme/useTeamVisual';
import { useThemePack } from '@/theme/useThemePack';

export interface BuzzerProps {
  state: BuzzerVisualState;
  /** The player's team colour, used by the states the pack paints in the team colour. */
  teamColorKey?: string;
  /** What the state means, in words: the buzzer never relies on its colour alone. */
  label: string;
  sublabel?: string;
  disabled?: boolean;
  onPress: () => void;
}

const useStyles = makeStyles({
  button: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalS,
    width: 'min(72vw, 18rem)',
    aspectRatio: '1',
    padding: tokens.spacingHorizontalXL,
    borderRadius: appTokens.buzzerRadius,
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
    boxShadow: appTokens.shadow,
    backgroundColor: 'var(--buzzer-fill)',
    color: 'var(--buzzer-text)',
    fontFamily: appTokens.fontHeading,
    textAlign: 'center',
    cursor: 'pointer',
    // A fast double tap must not zoom the page, and a long press must not select the label.
    touchAction: 'manipulation',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    ':disabled': {
      cursor: 'not-allowed',
    },
    ':focus-visible': {
      outlineWidth: tokens.strokeWidthThick,
      outlineStyle: 'solid',
      outlineColor: tokens.colorStrokeFocus2,
      outlineOffset: tokens.strokeWidthThick,
    },
  },
  label: {
    fontSize: tokens.fontSizeHero800,
    lineHeight: tokens.lineHeightHero800,
    fontWeight: tokens.fontWeightBold,
  },
  sublabel: {
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
  },
  pulse: {
    animationName: {
      '0%': { transform: 'scale(1)' },
      '50%': { transform: 'scale(1.04)' },
      '100%': { transform: 'scale(1)' },
    },
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  blink: {
    animationName: {
      '0%': { opacity: 1 },
      '50%': { opacity: 0.55 },
      '100%': { opacity: 1 },
    },
    animationDuration: '0.8s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'steps(2, jump-none)',
  },
  // Placed after the animations so it wins: some people get ill from motion and ask their device to reduce it.
  reducedMotion: {
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
});

/**
 * The big round buzzer. It fires on `pointerdown`, not on click: a click only fires when the finger lifts, which
 * costs time in a race. Keyboard activation (Enter, Space) still works through the click a button gets for it.
 */
export const Buzzer = observer(function Buzzer({
  state,
  teamColorKey,
  label,
  sublabel,
  disabled = false,
  onPress,
}: BuzzerProps) {
  const styles = useStyles();
  const look = useThemePack().buzzer.states[state];
  const team = useTeamVisual(teamColorKey ?? '', '');
  const fill = look.colors === 'team' ? team.fill : look.colors.fill;
  const text = look.colors === 'team' ? team.onFill : look.colors.text;

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    // Browsers deliver pointer events even to a disabled button (only click is suppressed), so check it here.
    // Only the main mouse button or a finger: a right click or a second finger is not a buzz.
    if (!disabled && event.button === 0 && event.isPrimary) {
      onPress();
    }
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // A pointer press already fired on pointerdown. A click from Enter or Space has `detail` 0 (no pointer clicks
    // were counted), so only that one gets through: one press, one call.
    if (event.detail === 0) {
      onPress();
    }
  }

  return (
    <button
      type="button"
      className={mergeClasses(
        styles.button,
        look.animation === 'pulse' && styles.pulse,
        look.animation === 'blink' && styles.blink,
        styles.reducedMotion,
      )}
      style={{ '--buzzer-fill': fill, '--buzzer-text': text }}
      data-state={state}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <span className={styles.label}>{label}</span>
      {sublabel && <span className={styles.sublabel}>{sublabel}</span>}
    </button>
  );
});
