import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, makeStyles } from '@fluentui/react-components';
import { EditRegular, MoreVerticalRegular } from '@fluentui/react-icons';
import { observer } from 'mobx-react-lite';
import type { TeamsViewModel } from './TeamsViewModel';
import { TAP_TARGET } from '@/components/sizes';

const useStyles = makeStyles({
  // Icon-only buttons still get a finger-sized target; the accessible name says what each one is for.
  button: {
    flexShrink: 0,
    minWidth: TAP_TARGET,
    minHeight: TAP_TARGET,
  },
});

/** The ⋮ on a team card (admin only; for anyone else the view model offers no admin actions and the card has none). */
export const TeamActionsMenu = observer(function TeamActionsMenu({
  vm,
  teamId,
  teamName,
}: {
  vm: TeamsViewModel;
  teamId: number;
  teamName: string;
}) {
  const styles = useStyles();
  if (!vm.isAdmin) {
    return null;
  }
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button
          className={styles.button}
          appearance="subtle"
          icon={<MoreVerticalRegular />}
          aria-label={`Actions for ${teamName}`}
        />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem onClick={() => vm.openRenameTeam(teamId)}>Rename</MenuItem>
          <MenuItem onClick={() => vm.openDeleteTeam(teamId)}>Delete</MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
});

/** What sits at the end of a member row: ✎ for the viewer's own names, ⋮ for an admin, nothing for anyone else. */
export const MemberActionsControl = observer(function MemberActionsControl({
  vm,
  playerId,
  displayName,
}: {
  vm: TeamsViewModel;
  playerId: number;
  displayName: string;
}) {
  const styles = useStyles();
  switch (vm.memberActions(playerId)) {
    case 'none':
      return null;
    case 'editOwnNames':
      return (
        <Button
          className={styles.button}
          appearance="subtle"
          icon={<EditRegular />}
          aria-label="Edit your names"
          onClick={() => vm.openEditNames(playerId)}
        />
      );
    case 'manage':
      return (
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button
              className={styles.button}
              appearance="subtle"
              icon={<MoreVerticalRegular />}
              aria-label={`Actions for ${displayName}`}
            />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem onClick={() => vm.openEditNames(playerId)}>Edit names</MenuItem>
              <MenuItem onClick={() => vm.openMovePlayer(playerId)}>Move to…</MenuItem>
              <MenuItem onClick={() => vm.openMakeAdmin(playerId)}>Make admin</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      );
  }
});
