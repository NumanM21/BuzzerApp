import { Button, MessageBar, MessageBarActions, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { observer } from 'mobx-react-lite';
import { useViewModel } from '@/app/useViewModel';
import { TeamCard } from '@/components/TeamCard';
import { appTokens } from '@/theme/appTokens';
import { TeamActionsMenu, MemberActionsControl } from './TeamMenus';
import { TeamsDialogs } from './TeamsDialogs';
import { TeamsViewModel } from './TeamsViewModel';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  heading: {
    margin: 0,
    fontFamily: appTokens.fontHeading,
    // Explicit, or the browser's 1.5em default outgrows the inherited line height and a wrapped heading overlaps itself.
    fontSize: tokens.fontSizeBase600,
    lineHeight: tokens.lineHeightBase600,
  },
  addButton: {
    minHeight: '44px',
  },
  // One column on a phone, more as the screen allows. Nothing assumes a number of teams.
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 18rem), 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  hint: {
    margin: 0,
    color: appTokens.textMuted,
  },
});

/** `/teams`: every team with its members. Players edit their own names; admins manage teams and people. */
export const TeamsPage = observer(function TeamsPage() {
  const vm = useViewModel(
    (services) =>
      new TeamsViewModel(services.teams, services.session, services.round, services.event, services.themes),
  );
  const styles = useStyles();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Teams</h1>
        {vm.isAdmin && (
          <Button className={styles.addButton} icon={<AddRegular />} onClick={vm.openAddTeam}>
            Add team
          </Button>
        )}
      </div>

      {vm.loadError !== undefined && (
        <MessageBar intent="error">
          <MessageBarBody>{vm.loadError}</MessageBarBody>
          <MessageBarActions>
            <Button onClick={vm.reload}>Try again</Button>
          </MessageBarActions>
        </MessageBar>
      )}

      {vm.state === 'loading' && <Spinner label="Loading the teams" />}
      {vm.state === 'empty' && (
        <p className={styles.hint}>{vm.isAdmin ? 'There are no teams yet. Add the first one.' : 'There are no teams yet.'}</p>
      )}
      {vm.state === 'ready' && (
        <div className={styles.grid}>
          {vm.cards.map((card) => (
            <TeamCard
              key={card.id}
              name={card.name}
              colorKey={card.colorKey}
              iconKey={card.iconKey}
              members={card.members}
              action={<TeamActionsMenu vm={vm} teamId={card.id} teamName={card.name} />}
              renderMemberAction={(member) => (
                <MemberActionsControl vm={vm} playerId={member.id} displayName={member.displayName} />
              )}
            />
          ))}
        </div>
      )}

      <TeamsDialogs dialog={vm.dialog} />
    </div>
  );
});
