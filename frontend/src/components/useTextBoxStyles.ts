import { makeStyles } from '@fluentui/react-components';
import { TAP_TARGET } from './sizes';

/**
 * How every text box in the app sizes itself: the join screen, the dialogs and the score form. One definition, so a
 * fix for phones reaches all of them.
 */
export const useTextBoxStyles = makeStyles({
  textBox: {
    // Fluent caps an input at 400px; on a phone it should fill the width it is given, and a finger needs the height.
    width: '100%',
    maxWidth: 'none',
    minHeight: TAP_TARGET,
    // A text box's built-in width is about twenty characters. Fluent's `Field` lays its children out as a grid, and
    // a grid column is never narrower than the smallest its content allows, so without this a box in a narrow place
    // (Points and Multiplier, side by side) kept its twenty characters and pushed the page wider than a 360 px phone.
    minWidth: 0,
  },
});
