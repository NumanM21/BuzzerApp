import { makeAutoObservable, observableRef } from 'mobx';
import type { Member, Team } from '@/api/types';
import { isRoundRunning } from '@/domain/round';
import type { PackKeys, ThemeCatalog } from '@/domain/themeCatalog';
import { Loadable } from '@/mvvm/Loadable';
import { listStateOf, type ListState } from '@/mvvm/listState';
import type { EventStore } from '@/stores/EventStore';
import type { RoundStore } from '@/stores/RoundStore';
import type { SessionStore } from '@/stores/SessionStore';
import type { TeamsStore } from '@/stores/TeamsStore';
import { AddTeamViewModel } from './AddTeamViewModel';
import { DeleteTeamViewModel } from './DeleteTeamViewModel';
import { EditNamesViewModel } from './EditNamesViewModel';
import { MakeAdminViewModel } from './MakeAdminViewModel';
import { MovePlayerViewModel } from './MovePlayerViewModel';
import { RenameTeamViewModel } from './RenameTeamViewModel';

/** One member row, in the shape the shared team card draws. */
export interface TeamMemberModel {
  id: number;
  displayName: string;
  /** Only what the server sent: every member's for an admin, the viewer's own for a player. */
  realName: string | null;
  isViewer: boolean;
}

export interface TeamCardModel {
  id: number;
  name: string;
  colorKey: string;
  iconKey: string;
  members: TeamMemberModel[];
}

/** What the view offers on a member's row: nothing, a ✎ for the viewer's own names, or an admin's ⋮ menu. */
export type MemberActions = 'none' | 'editOwnNames' | 'manage';

/** The open dialog, if any. One at a time; the view draws the one whose `kind` matches. */
export type TeamsDialog =
  | { kind: 'editNames'; vm: EditNamesViewModel }
  | { kind: 'renameTeam'; vm: RenameTeamViewModel }
  | { kind: 'movePlayer'; vm: MovePlayerViewModel }
  | { kind: 'makeAdmin'; vm: MakeAdminViewModel }
  | { kind: 'addTeam'; vm: AddTeamViewModel }
  | { kind: 'deleteTeam'; vm: DeleteTeamViewModel };

export type TeamsScreenState = ListState;

/**
 * The shared Teams screen. Players see every team and edit their own names; admins also rename, add and delete
 * teams, edit anyone's names, move players and make admins. The screen shows the teams in the server's order.
 *
 * It also owns the open dialog: it builds the dialog's own view model (handing it the store and a way to close
 * itself), so a dialog never needs to know about the screen and the screen shows at most one.
 */
export class TeamsViewModel {
  dialog: TeamsDialog | undefined = undefined;

  private readonly packKeys: Loadable<PackKeys>;

  private readonly teams: TeamsStore;
  private readonly session: SessionStore;
  private readonly round: RoundStore;

  constructor(teams: TeamsStore, session: SessionStore, round: RoundStore, event: EventStore, themes: ThemeCatalog) {
    this.teams = teams;
    this.session = session;
    this.round = round;
    // The catalog answers the default pack's keys for a key it doesn't know, which is also what shows when the
    // event could not be loaded.
    this.packKeys = new Loadable(() => themes.loadKeys(event.themeKey ?? ''));
    makeAutoObservable<TeamsViewModel, 'teams' | 'session' | 'round' | 'packKeys'>(
      this,
      { dialog: observableRef, teams: false, session: false, round: false, packKeys: false },
      { autoBind: true },
    );
  }

  activate(): void {
    void this.teams.teams.ensureLoaded();
    void this.packKeys.ensureLoaded();
  }

  dispose(): void {
    this.dialog = undefined;
  }

  // --- What the view shows -------------------------------------------------------------------------------------

  get isAdmin(): boolean {
    return this.session.isAdmin;
  }

  get state(): TeamsScreenState {
    return listStateOf(this.teams.teams);
  }

  /** Why the last load failed. With a list on screen it is stale rather than missing: show both. */
  get loadError(): string | undefined {
    return this.teams.teams.error?.message;
  }

  get cards(): TeamCardModel[] {
    const viewerId = this.session.me?.playerId;
    return (this.teams.teams.value ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      colorKey: team.colorKey,
      iconKey: team.iconKey,
      members: team.members.map((member) => ({
        id: member.playerId,
        displayName: member.displayName,
        realName: member.realName,
        isViewer: member.playerId === viewerId,
      })),
    }));
  }

  memberActions(playerId: number): MemberActions {
    if (this.isAdmin) {
      return 'manage';
    }
    return playerId === this.session.me?.playerId ? 'editOwnNames' : 'none';
  }

  reload(): void {
    void this.teams.teams.load();
  }

  // --- Opening and closing dialogs --------------------------------------------------------------------------------

  /** ✎ on the viewer's own row, or ⋮ → Edit names for an admin. Anyone else's row offers nothing to a player. */
  openEditNames(playerId: number): void {
    const found = this.findMember(playerId);
    if (found === undefined || this.memberActions(playerId) === 'none') {
      return;
    }
    const isOwn = playerId === this.session.me?.playerId;
    this.dialog = {
      kind: 'editNames',
      vm: new EditNamesViewModel(
        { playerId, displayName: found.member.displayName, realName: found.member.realName, isOwn },
        this.teams,
        () => this.roundIsRunning,
        this.closeDialog,
      ),
    };
  }

  openRenameTeam(teamId: number): void {
    const team = this.findTeam(teamId);
    if (team === undefined || !this.isAdmin) {
      return;
    }
    this.dialog = {
      kind: 'renameTeam',
      vm: new RenameTeamViewModel({ id: team.id, name: team.name }, this.teams, () => this.roundIsRunning, this.closeDialog),
    };
  }

  openMovePlayer(playerId: number): void {
    const found = this.findMember(playerId);
    if (found === undefined || !this.isAdmin) {
      return;
    }
    this.dialog = {
      kind: 'movePlayer',
      vm: new MovePlayerViewModel(
        { playerId, displayName: found.member.displayName, teamId: found.team.id },
        this.teams,
        () => this.roundIsRunning,
        this.closeDialog,
      ),
    };
  }

  openMakeAdmin(playerId: number): void {
    const found = this.findMember(playerId);
    if (found === undefined || !this.isAdmin) {
      return;
    }
    this.dialog = {
      kind: 'makeAdmin',
      vm: new MakeAdminViewModel(
        { playerId, displayName: found.member.displayName, teamName: found.team.name },
        this.teams,
        this.closeDialog,
      ),
    };
  }

  openAddTeam(): void {
    if (!this.isAdmin) {
      return;
    }
    // The keys are normally loaded by now; the dialog says "loading" if not, and fills in when they arrive.
    void this.packKeys.ensureLoaded();
    this.dialog = {
      kind: 'addTeam',
      vm: new AddTeamViewModel(this.teams, () => this.packKeys.value, this.closeDialog),
    };
  }

  openDeleteTeam(teamId: number): void {
    const team = this.findTeam(teamId);
    if (team === undefined || !this.isAdmin) {
      return;
    }
    this.dialog = {
      kind: 'deleteTeam',
      vm: new DeleteTeamViewModel({ id: team.id, name: team.name }, this.teams, this.closeDialog),
    };
  }

  closeDialog(): void {
    this.dialog = undefined;
  }

  // --- Internals -------------------------------------------------------------------------------------------------

  // Dialogs read it through a function each time, because a round can begin while one is open.
  private get roundIsRunning(): boolean {
    return isRoundRunning(this.round.publicSnapshot);
  }

  private findTeam(teamId: number): Team | undefined {
    return this.teams.teams.value?.find((team) => team.id === teamId);
  }

  private findMember(playerId: number): { team: Team; member: Member } | undefined {
    for (const team of this.teams.teams.value ?? []) {
      const member = team.members.find((candidate) => candidate.playerId === playerId);
      if (member !== undefined) {
        return { team, member };
      }
    }
    return undefined;
  }
}
