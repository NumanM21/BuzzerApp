import { makeStyles } from '@fluentui/react-components';
import { TAP_TARGET } from './sizes';

// Fluent caps a control at 400px; on a phone it should fill the width it is given.
// `minWidth: 0` lets it also get narrower than its built-in width: about twenty characters for a text box, the
// longest option for a drop-down. Fluent's `Field` lays its children out as a grid, and a grid column is never
// narrower than the smallest its content allows, so without it a text box in a narrow place (Points and Multiplier,
// side by side) or a drop-down with one long option (a 24-character team name) pushed the page wider than a 360 px
// phone.
const fillsItsField = {
  width: '100%',
  maxWidth: 'none',
  minWidth: 0,
} as const;

/**
 * How every text box and drop-down in the app sizes itself: the join screen, the dialogs and the score form. One
 * definition, so a fix for phones reaches all of them.
 */
export const useFieldControlStyles = makeStyles({
  /** For Fluent's `Input`. */
  textBox: {
    ...fillsItsField,
    // A finger needs the height.
    minHeight: TAP_TARGET,
  },
  /** For Fluent's `Select` itself. */
  select: fillsItsField,
  /** For the `select` slot inside it: the box a finger taps is the inner element, not the wrapper. */
  selectControl: {
    minHeight: TAP_TARGET,
  },
});
