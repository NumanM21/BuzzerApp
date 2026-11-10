import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  makeStyles,
  shorthands,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Select,
  Slider,
  Spinner,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TabList,
  tokens,
} from '@fluentui/react-components';
import { observer } from 'mobx-react-lite';
import type { ReactNode } from 'react';
import { useViewModel } from '@/app/useViewModel';
import { Buzzer } from '@/components/Buzzer';
import { TeamCard } from '@/components/TeamCard';
import { appTokens } from '@/theme/appTokens';
import { buzzerCopyKeys } from '@/theme/defaultCopy';
import { ThemeRoot } from '@/theme/ThemeRoot';
import { useCopy, useFormatScore } from '@/theme/useThemePack';
import {
  MAX_PREVIEW_TEAMS,
  MIN_PREVIEW_TEAMS,
  ThemePreviewViewModel,
  type PreviewTeam,
} from './ThemePreviewViewModel';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalL,
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalL,
  },
  control: {
    minWidth: '12rem',
    flexGrow: 1,
  },
  preview: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXL,
    padding: tokens.spacingHorizontalL,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  heading: {
    margin: 0,
    fontFamily: appTokens.fontHeading,
    // Explicit, or the browser's 1.5em default outgrows the inherited line height and a wrapped heading overlaps itself.
    fontSize: tokens.fontSizeBase600,
    lineHeight: tokens.lineHeightBase600,
  },
  // Columns appear as the screen widens, from one on a phone; nothing assumes a team count.
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 18rem), 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  swatch: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  swatchColor: {
    width: '2.5rem',
    height: '2.5rem',
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
    backgroundColor: 'var(--swatch)',
  },
  panel: {
    padding: tokens.spacingHorizontalM,
    backgroundColor: appTokens.surfacePanel,
    ...shorthands.border(appTokens.borderWidth, appTokens.borderStyle, appTokens.surfacePanelBorder),
    boxShadow: appTokens.shadow,
  },
  muted: {
    color: appTokens.textMuted,
  },
  fontHeading: { fontFamily: appTokens.fontHeading },
  fontBody: { fontFamily: appTokens.fontBody },
  fontNumeric: { fontFamily: appTokens.fontNumeric, fontSize: tokens.fontSizeHero700 },
  buzzers: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXXL,
    justifyContent: 'center',
  },
});

// The app tokens that are colours, in the order the swatches show them.
const colorTokens = [
  ['surfacePage', appTokens.surfacePage],
  ['surfacePanel', appTokens.surfacePanel],
  ['surfacePanelBorder', appTokens.surfacePanelBorder],
  ['textBody', appTokens.textBody],
  ['textMuted', appTokens.textMuted],
] as const;

/** Dev only (`/dev/theme`): every token, font, Fluent control, team card and buzzer state for any pack. */
export const ThemePreviewPage = observer(function ThemePreviewPage() {
  const vm = useViewModel((services) => new ThemePreviewViewModel(services.themes));
  const styles = useStyles();

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Theme preview</h1>
      <div className={styles.controls}>
        <Field label="Theme pack" className={styles.control}>
          <Select value={vm.selectedPackKey} onChange={(_, data) => vm.selectPack(data.value)}>
            {vm.packKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Number of teams: ${vm.teamCount}`} className={styles.control}>
          <Slider
            min={MIN_PREVIEW_TEAMS}
            max={MAX_PREVIEW_TEAMS}
            value={vm.teamCount}
            onChange={(_, data) => vm.setTeamCount(data.value)}
          />
        </Field>
      </div>
      {/* The preview gets its own theme, so switching packs here leaves the rest of the app alone. */}
      <ThemeRoot themeKey={vm.selectedPackKey} scope="section">
        <PackPreview vm={vm} />
      </ThemeRoot>
    </main>
  );
});

const PackPreview = observer(function PackPreview({ vm }: { vm: ThemePreviewViewModel }) {
  const styles = useStyles();
  const copy = useCopy();
  const formatScore = useFormatScore();

  if (vm.loadError) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{vm.loadError}</MessageBarBody>
      </MessageBar>
    );
  }
  if (vm.isLoading) {
    return <Spinner label="Loading pack" />;
  }

  return (
    <div className={styles.preview}>
      <PreviewSection title="Colour tokens">
        <div className={styles.row}>
          {colorTokens.map(([name, value]) => (
            <span key={name} className={styles.swatch}>
              <span className={styles.swatchColor} style={{ '--swatch': value }} />
              <code>{name}</code>
            </span>
          ))}
        </div>
        <div className={styles.panel}>
          Body text on a panel. <span className={styles.muted}>Muted text on a panel.</span>
        </div>
      </PreviewSection>

      <PreviewSection title="Fonts">
        <p className={styles.fontHeading}>Heading: The quick brown fox</p>
        <p className={styles.fontBody}>Body: The quick brown fox jumps over the lazy dog.</p>
        <div className={styles.row}>
          {vm.sampleScores.map((score) => (
            <span key={score} className={styles.fontNumeric}>
              {formatScore(score)}
            </span>
          ))}
        </div>
      </PreviewSection>

      <PreviewSection title="Fluent controls">
        <div className={styles.row}>
          <Button appearance="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button disabled>Disabled</Button>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button>Menu</Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem>Rename</MenuItem>
                <MenuItem>Delete</MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
          <Dialog>
            <DialogTrigger disableButtonEnhancement>
              <Button>Dialog</Button>
            </DialogTrigger>
            <DialogSurface>
              <DialogBody>
                <DialogTitle>Rename team</DialogTitle>
                <DialogContent>
                  <Field label="Team name">
                    <Input />
                  </Field>
                </DialogContent>
                <DialogActions>
                  <DialogTrigger disableButtonEnhancement>
                    <Button>Cancel</Button>
                  </DialogTrigger>
                  <Button appearance="primary">Save</Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </div>
        <Field label="Display name" hint="2 to 20 characters">
          <Input />
        </Field>
        <Field label="With an error" validationMessage="That name is taken.">
          <Input />
        </Field>
        <TabList defaultSelectedValue="teams">
          <Tab value="buzz">Buzz</Tab>
          <Tab value="teams">Teams</Tab>
          <Tab value="scores">Scores</Tab>
        </TabList>
        <Table aria-label="Sample scores">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Player</TableHeaderCell>
              <TableHeaderCell>Score</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vm.sampleScores.map((score, index) => (
              <TableRow key={score}>
                <TableCell>Player {index + 1}</TableCell>
                <TableCell>{formatScore(score)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <MessageBar intent="info">
          <MessageBarBody>
            <MessageBarTitle>Information</MessageBarTitle>
            The round starts when the host presses Begin.
          </MessageBarBody>
        </MessageBar>
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Error</MessageBarTitle>
            Could not reach the server.
          </MessageBarBody>
        </MessageBar>
      </PreviewSection>

      <PreviewSection title="Team colours">
        <TeamGrid teams={vm.colorCards} />
      </PreviewSection>

      <PreviewSection title={`Teams (${vm.teamCount})`}>
        <TeamGrid teams={vm.sampleTeams} />
      </PreviewSection>

      <PreviewSection title="Buzzer">
        <p>Presses: {vm.buzzerPresses}</p>
        <div className={styles.buzzers}>
          {vm.buzzerSamples.map((sample) => (
            <Buzzer
              key={sample.state}
              state={sample.state}
              teamColorKey={vm.buzzerTeamColorKey}
              label={copy[buzzerCopyKeys[sample.state]]}
              sublabel={sample.queuePosition === undefined ? undefined : `Number ${sample.queuePosition}`}
              onPress={vm.pressBuzzer}
            />
          ))}
        </div>
      </PreviewSection>
    </div>
  );
});

function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      {children}
    </section>
  );
}

const TeamGrid = observer(function TeamGrid({ teams }: { teams: readonly PreviewTeam[] }) {
  const styles = useStyles();
  return (
    <div className={styles.grid}>
      {teams.map((team) => (
        <TeamCard
          key={team.id}
          name={team.name}
          colorKey={team.colorKey}
          iconKey={team.iconKey}
          members={team.members}
        />
      ))}
    </div>
  );
});
