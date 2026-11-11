import { makeStyles, tokens } from '@fluentui/react-components';
import { appTokens } from '@/theme/appTokens';

/**
 * The frame every screen shares: the page as a column, its title, its sections and their titles, and the muted line
 * for "nothing here yet". One definition, so a screen added next year looks like the others without copying them.
 */
export const usePageStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  title: {
    margin: 0,
    fontFamily: appTokens.fontHeading,
    // Explicit, or the browser's 1.5em default outgrows the inherited line height and a wrapped heading overlaps itself.
    fontSize: tokens.fontSizeBase600,
    lineHeight: tokens.lineHeightBase600,
    overflowWrap: 'anywhere',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  sectionTitle: {
    margin: 0,
    fontFamily: appTokens.fontHeading,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    overflowWrap: 'anywhere',
  },
  hint: {
    margin: 0,
    color: appTokens.textMuted,
    overflowWrap: 'anywhere',
  },
});
