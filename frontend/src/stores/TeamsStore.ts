import { makeAutoObservable, reaction } from 'mobx';
import type { PlayersApi } from '@/api/PlayersApi';
import type { TeamsApi } from '@/api/TeamsApi';
import type { CreateTeamRequest, Player, Team, TeamSummary, UpdatePlayerNamesRequest } from '@/api/types';
import { Loadable } from '@/mvvm/Loadable';
import type { GameEvents } from '@/realtime/GameEvents';
import type { ScoresStore } from './ScoresStore';
import type { SessionStore } from './SessionStore';

/**
 * The teams and their members, in the order the server sends them, plus every write that changes them: team
 * rename, create and delete, and the player edits that change who is on which team or under what name.
 *
 * A team's or player's name also appears on the scoreboards, and the caller's own team, name and role live in the
 * session. So every write reloads, at once, what it touched: this store, the scores already shown, and (when it
 * changed the caller) the session.
 */
export class TeamsStore {
  readonly teams: Loadable<Team[]>;

  private readonly api: TeamsApi;
  private readonly players: PlayersApi;
  private readonly session: SessionStore;
  private readonly scores: ScoresStore;

  constructor(api: TeamsApi, players: PlayersApi, session: SessionStore, scores: ScoresStore, events: GameEvents) {
    this.api = api;
    this.players = players;
    this.session = session;
    this.scores = scores;
    this.teams = new Loadable(() => api.getTeams());

    // The stores live as long as the app, so these subscriptions are never undone. A change to teams can be a
    // change to the caller (moved to another team, made an admin), hence the session refresh.
    events.onTeamsChanged(() => void this.reloadAfterChange(true));
    events.onReconnected(() => void this.reloadAfterChange(true));
    // Another person on this phone must never see the last person's data, not even while a reload runs.
    reaction(
      () => session.me?.playerId,
      () => this.teams.reset(),
    );

    makeAutoObservable<TeamsStore, 'api' | 'players' | 'session' | 'scores'>(
      this,
      { teams: false, api: false, players: false, session: false, scores: false },
      { autoBind: true },
    );
  }

  /** Admin only. */
  async createTeam(request: CreateTeamRequest): Promise<TeamSummary> {
    const team = await this.api.createTeam(request);
    await this.reloadAfterChange(false);
    return team;
  }

  /** Admin only. */
  async renameTeam(teamId: number, name: string): Promise<TeamSummary> {
    const team = await this.api.renameTeam(teamId, name);
    await this.reloadAfterChange(false);
    return team;
  }

  /** Admin only. The server refuses while the team has players, scores or buzz history. */
  async deleteTeam(teamId: number): Promise<void> {
    await this.api.deleteTeam(teamId);
    await this.reloadAfterChange(false);
  }

  /** Admin only: change anyone's display name or real name. */
  async editNames(playerId: number, request: UpdatePlayerNamesRequest): Promise<Player> {
    const player = await this.players.updatePlayerNames(playerId, request);
    await this.reloadAfterChange(playerId === this.session.me?.playerId);
    return player;
  }

  /** Any signed-in player: change their own names. */
  async editOwnNames(request: UpdatePlayerNamesRequest): Promise<Player> {
    const player = await this.players.updateMyNames(request);
    await this.reloadAfterChange(true);
    return player;
  }

  /** Admin only. */
  async movePlayer(playerId: number, teamId: number): Promise<Player> {
    const player = await this.players.movePlayer(playerId, teamId);
    await this.reloadAfterChange(playerId === this.session.me?.playerId);
    return player;
  }

  /** Admin only. */
  async promote(playerId: number): Promise<Player> {
    const player = await this.players.promotePlayer(playerId);
    await this.reloadAfterChange(playerId === this.session.me?.playerId);
    return player;
  }

  /** Reloads the teams and the scores already shown; with `refreshSession`, the caller's own `me` too. */
  private async reloadAfterChange(refreshSession: boolean): Promise<void> {
    await Promise.all([
      this.teams.reloadIfRequested(),
      this.scores.reloadRequested(),
      refreshSession && this.session.status === 'signedIn' ? this.session.refresh() : undefined,
    ]);
  }
}
