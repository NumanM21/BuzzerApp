import { makeStyles, tokens } from '@fluentui/react-components';
import { TAP_TARGET } from './sizes';

/** Styles the small team dialogs share, so a text box looks and sizes the same in every one. */
export const useDialogStyles = makeStyles({
  // Fluent caps an input at 400px; a finger needs the height, and a dialog on a phone is narrow.
  input: {
    width: '100%',
    maxWidth: 'none',
    minHeight: TAP_TARGET,
  },
  // A 24-character team name in a wide font must wrap rather than widen the dialog.
  paragraph: {
    margin: 0,
    overflowWrap: 'anywhere',
  },
  emphasis: {
    fontWeight: tokens.fontWeightSemibold,
  },
});
