import { Body1, makeStyles, Title1, tokens } from '@fluentui/react-components';
import { Link } from 'react-router';
import { appTokens } from '@/theme/appTokens';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
  },
  title: {
    fontFamily: appTokens.fontHeading,
  },
});

// A placeholder for the shell until F3 sends `/` to the right start page.
export function HomePage() {
  const styles = useStyles();
  return (
    <main className={styles.root}>
      <Title1 as="h1" className={styles.title}>
        Buzzer
      </Title1>
      <Body1>Games night buzzer and scoreboard.</Body1>
      {import.meta.env.DEV && <Link to="/dev/theme">Theme preview</Link>}
    </main>
  );
}
