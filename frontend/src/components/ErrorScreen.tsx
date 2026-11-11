import { makeStyles } from '@fluentui/react-components';
import { TAP_TARGET } from './sizes';

export interface ErrorScreenProps {
  /** Starts the app again; the only way out when a file of the app itself failed to arrive. */
  onReload: () => void;
}

// Sizes only, and plain elements: this screen also shows when the theme itself could not be loaded, so it can't use
// a theme token or a Fluent control. Inside a theme it inherits the page's colours and font.
const useStyles = makeStyles({
  screen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '1rem',
    padding: '1.5rem',
  },
  heading: {
    margin: 0,
    fontSize: '1.25rem',
    lineHeight: '1.3',
    overflowWrap: 'anywhere',
  },
  text: {
    margin: 0,
  },
  button: {
    minHeight: TAP_TARGET,
    padding: '0 1.25rem',
    fontSize: '1rem',
    cursor: 'pointer',
  },
});

/**
 * What a person sees when a screen can't be drawn: usually a file of the app that didn't arrive (a bad connection, or
 * a phone still holding the page from before an update). It says so in plain words and offers the one thing that
 * helps. No error text or stack trace: those mean nothing to a player.
 */
export function ErrorScreen({ onReload }: ErrorScreenProps) {
  const styles = useStyles();

  return (
    <div className={styles.screen} role="alert">
      <h1 className={styles.heading}>Something went wrong</h1>
      <p className={styles.text}>This screen could not be shown. Check your connection, then reload.</p>
      <button className={styles.button} type="button" onClick={onReload}>
        Reload
      </button>
    </div>
  );
}
