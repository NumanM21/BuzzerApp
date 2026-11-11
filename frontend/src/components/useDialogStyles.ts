import { makeStyles, tokens } from '@fluentui/react-components';

/** Styles the small dialogs share for their sentences. (Their text boxes use `useFieldControlStyles`.) */
export const useDialogStyles = makeStyles({
  // A 24-character team name in a wide font must wrap rather than widen the dialog.
  paragraph: {
    margin: 0,
    overflowWrap: 'anywhere',
  },
  emphasis: {
    fontWeight: tokens.fontWeightSemibold,
  },
});
