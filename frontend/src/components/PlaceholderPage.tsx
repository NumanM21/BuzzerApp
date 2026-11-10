import { makeStyles, tokens } from '@fluentui/react-components';
import { appTokens } from '@/theme/appTokens';

const useStyles = makeStyles({
  heading: {
    margin: 0,
    fontFamily: appTokens.fontHeading,
    // Explicit, or the browser's 1.5em default outgrows the inherited line height and a wrapped heading overlaps itself.
    fontSize: tokens.fontSizeBase600,
    lineHeight: tokens.lineHeightBase600,
    overflowWrap: 'anywhere',
  },
});

/** A screen that a later step builds: just its title inside the layout, so the navigation and guards can be used. */
export function PlaceholderPage({ title }: { title: string }) {
  const styles = useStyles();
  return <h1 className={styles.heading}>{title}</h1>;
}
