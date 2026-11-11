import {
  Button,
  Field,
  Input,
  makeStyles,
  mergeClasses,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Spinner,
  Tab,
  TabList,
  tokens,
} from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useViewModel } from '@/app/useViewModel';
import { TeamPicker } from '@/components/TeamPicker';
import { usePageStyles } from '@/components/usePageStyles';
import { useTextBoxStyles } from '@/components/useTextBoxStyles';
import { appTokens } from '@/theme/appTokens';
import { JoinViewModel } from './JoinViewModel';
import { TAP_TARGET } from '@/components/sizes';

const useStyles = makeStyles({
  // Added to the shared page frame: the join screen is shown outside the app shell, which is what gives every other
  // screen its side padding and keeps it from stretching across a wide window.
  outsideShell: {
    boxSizing: 'border-box',
    maxWidth: '32rem',
    margin: '0 auto',
    padding: tokens.spacingHorizontalL,
  },
  eventName: {
    margin: 0,
    color: appTokens.textMuted,
    overflowWrap: 'anywhere',
  },
  tab: {
    minHeight: TAP_TARGET,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  codeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  codeField: {
    flexGrow: 1,
    flexBasis: '12rem',
  },
  button: {
    minHeight: TAP_TARGET,
  },
  fieldError: {
    margin: 0,
    color: tokens.colorPaletteRedForeground1,
  },
});

/** `/join`: register as a new player or sign in. Everything it decides and says comes from `JoinViewModel`. */
export const JoinPage = observer(function JoinPage() {
  const [searchParams] = useSearchParams();
  const urlCode = searchParams.get('code') ?? undefined;
  const vm = useViewModel(
    (services) =>
      new JoinViewModel(services.session, services.eventApi, services.event, services.joinCodeMemory, urlCode),
  );
  const styles = useStyles();
  const page = usePageStyles();
  const textBox = useTextBoxStyles();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void vm.submit();
  };

  return (
    <main className={mergeClasses(page.page, styles.outsideShell)}>
      <div>
        {vm.eventName && <p className={styles.eventName}>{vm.eventName}</p>}
        <h1 className={page.title}>Join the game</h1>
      </div>

      <TabList selectedValue={vm.tab} onTabSelect={(_, data) => vm.selectTab(data.value)} size="large">
        <Tab className={styles.tab} value="register">
          New player
        </Tab>
        <Tab className={styles.tab} value="signIn">
          Sign in
        </Tab>
      </TabList>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.codeRow}>
          <Field
            className={styles.codeField}
            label="Join code"
            validationMessage={vm.joinCodeError}
            validationState={vm.joinCodeError ? 'error' : 'none'}
          >
            <Input
              className={textBox.textBox}
              value={vm.joinCode}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(_, data) => vm.setJoinCode(data.value)}
              onBlur={vm.loadTeams}
            />
          </Field>
          {vm.tab === 'register' && (
            <Button className={styles.button} disabled={!vm.canLoadTeams} onClick={vm.continueWithCode}>
              Continue
            </Button>
          )}
        </div>

        <Field
          label="Your real name"
          hint={vm.tab === 'register' ? 'Only the hosts can see it.' : undefined}
          validationMessage={vm.fieldErrors.realName}
          validationState={vm.fieldErrors.realName ? 'error' : 'none'}
        >
          <Input
            className={textBox.textBox}
            value={vm.realName}
            autoComplete="off"
            onChange={(_, data) => vm.setRealName(data.value)}
          />
        </Field>

        {vm.tab === 'register' && (
          <Field
            label="Display name"
            hint="What everyone sees next to your buzz and your score."
            validationMessage={vm.fieldErrors.displayName}
            validationState={vm.fieldErrors.displayName ? 'error' : 'none'}
          >
            <Input
              className={textBox.textBox}
              value={vm.displayName}
              autoComplete="off"
              onChange={(_, data) => vm.setDisplayName(data.value)}
            />
          </Field>
        )}

        <Field
          label="PIN"
          hint={vm.tab === 'register' ? '4 digits. You use it to sign in again.' : undefined}
          validationMessage={vm.fieldErrors.pin}
          validationState={vm.fieldErrors.pin ? 'error' : 'none'}
        >
          <Input
            className={textBox.textBox}
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={vm.pin}
            onChange={(_, data) => vm.setPin(data.value)}
          />
        </Field>

        {vm.tab === 'register' && <TeamSection vm={vm} />}

        {vm.formError && (
          <MessageBar intent="error">
            <MessageBarBody>{vm.formError}</MessageBarBody>
            {vm.canSwitchToSignIn && (
              <MessageBarActions>
                <Button onClick={vm.signInInstead}>Sign in instead</Button>
              </MessageBarActions>
            )}
          </MessageBar>
        )}

        <Button className={styles.button} type="submit" appearance="primary" size="large" disabled={!vm.canSubmit}>
          {vm.submitLabel}
        </Button>
      </form>
    </main>
  );
});

const TeamSection = observer(function TeamSection({ vm }: { vm: JoinViewModel }) {
  const styles = useStyles();
  const page = usePageStyles();
  const teamError = vm.fieldErrors.teamId;

  switch (vm.pickerState) {
    case 'ready':
      return (
        <TeamPicker
          legend="Your team"
          options={vm.teamOptions}
          selectedId={vm.teamId}
          onSelect={vm.selectTeam}
          errorText={teamError}
        />
      );
    case 'loading':
      return <Spinner label="Loading the teams" />;
    case 'empty':
      return <p className={page.hint}>This event has no teams yet. Ask the host.</p>;
    case 'error':
      return (
        <MessageBar intent="error">
          <MessageBarBody>{vm.teamsError}</MessageBarBody>
        </MessageBar>
      );
    case 'needsCode':
      return (
        <>
          <p className={page.hint}>Enter the join code and press Continue to choose your team.</p>
          {teamError && <p className={styles.fieldError}>{teamError}</p>}
        </>
      );
  }
});
