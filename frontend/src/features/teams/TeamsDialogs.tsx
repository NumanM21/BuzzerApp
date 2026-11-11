import { observer } from 'mobx-react-lite';
import { useLastDefined } from '@/components/useLastDefined';
import { AddTeamDialog } from './AddTeamDialog';
import { DeleteTeamDialog } from './DeleteTeamDialog';
import { EditNamesDialog } from './EditNamesDialog';
import { MakeAdminDialog } from './MakeAdminDialog';
import { MovePlayerDialog } from './MovePlayerDialog';
import { RenameTeamDialog } from './RenameTeamDialog';
import type { TeamsDialog } from './TeamsViewModel';

/**
 * Draws the one open dialog, if any. Which dialog is open is the view model's decision; this only maps it to a view.
 * A dialog the view model has just closed is kept on the page, told `open={false}`, so it can close properly (see
 * `useLastDefined`).
 */
export const TeamsDialogs = observer(function TeamsDialogs({ dialog }: { dialog: TeamsDialog | undefined }) {
  const shown = useLastDefined(dialog);
  if (shown === undefined) {
    return null;
  }
  const open = dialog !== undefined;
  switch (shown.kind) {
    case 'editNames':
      return <EditNamesDialog vm={shown.vm} open={open} />;
    case 'renameTeam':
      return <RenameTeamDialog vm={shown.vm} open={open} />;
    case 'movePlayer':
      return <MovePlayerDialog vm={shown.vm} open={open} />;
    case 'makeAdmin':
      return <MakeAdminDialog vm={shown.vm} open={open} />;
    case 'addTeam':
      return <AddTeamDialog vm={shown.vm} open={open} />;
    case 'deleteTeam':
      return <DeleteTeamDialog vm={shown.vm} open={open} />;
  }
});
