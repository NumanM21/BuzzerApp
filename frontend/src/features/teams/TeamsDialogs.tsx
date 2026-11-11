import { observer } from 'mobx-react-lite';
import { AddTeamDialog } from './AddTeamDialog';
import { DeleteTeamDialog } from './DeleteTeamDialog';
import { EditNamesDialog } from './EditNamesDialog';
import { MakeAdminDialog } from './MakeAdminDialog';
import { MovePlayerDialog } from './MovePlayerDialog';
import { RenameTeamDialog } from './RenameTeamDialog';
import type { TeamsDialog } from './TeamsViewModel';

/** Draws the one open dialog, if any. Which dialog is open is the view model's decision; this only maps it to a view. */
export const TeamsDialogs = observer(function TeamsDialogs({ dialog }: { dialog: TeamsDialog | undefined }) {
  if (dialog === undefined) {
    return null;
  }
  switch (dialog.kind) {
    case 'editNames':
      return <EditNamesDialog vm={dialog.vm} />;
    case 'renameTeam':
      return <RenameTeamDialog vm={dialog.vm} />;
    case 'movePlayer':
      return <MovePlayerDialog vm={dialog.vm} />;
    case 'makeAdmin':
      return <MakeAdminDialog vm={dialog.vm} />;
    case 'addTeam':
      return <AddTeamDialog vm={dialog.vm} />;
    case 'deleteTeam':
      return <DeleteTeamDialog vm={dialog.vm} />;
  }
});
