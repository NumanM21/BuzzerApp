import { ApiError } from '@/api/ApiError';
import type { PlayersApi } from '@/api/PlayersApi';
import type { Player, UpdatePlayerNamesRequest } from '@/api/types';
import { makePlayers } from '@/test/factories';
import { CallRecorder } from './CallRecorder';

/**
 * In-memory `PlayersApi`. `myPlayerId` is the caller, for `updateMyNames`. It does not touch a `FakeTeamsApi`:
 * a test that needs the team list to change sets it by hand. `failNext(error)` makes the next call reject.
 */
export class FakePlayersApi implements PlayersApi {
  players: Player[] = makePlayers(6, 3);
  myPlayerId = 1;

  private readonly recorder = new CallRecorder();

  get calls(): readonly string[] {
    return this.recorder.calls;
  }

  failNext(error: Error): void {
    this.recorder.failNext(error);
  }

  /** Forgets the calls so far, to assert only on what a later step did. */
  clearCalls(): void {
    this.recorder.clearCalls();
  }

  getPlayers(): Promise<Player[]> {
    return this.recorder.run('getPlayers', () => this.players);
  }

  updateMyNames(request: UpdatePlayerNamesRequest): Promise<Player> {
    return this.recorder.run('updateMyNames', () => this.change(this.myPlayerId, namesOf(request)));
  }

  updatePlayerNames(playerId: number, request: UpdatePlayerNamesRequest): Promise<Player> {
    return this.recorder.run('updatePlayerNames', () => this.change(playerId, namesOf(request)));
  }

  movePlayer(playerId: number, teamId: number): Promise<Player> {
    return this.recorder.run('movePlayer', () => this.change(playerId, { teamId, teamName: `Team ${teamId}` }));
  }

  promotePlayer(playerId: number): Promise<Player> {
    return this.recorder.run('promotePlayer', () =>
      this.change(playerId, { role: 'admin', teamId: null, teamName: null }),
    );
  }

  private change(playerId: number, changes: Partial<Player>): Player {
    const player = this.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new ApiError({ status: 404, kind: 'notFound' });
    }
    const changed: Player = { ...player, ...changes };
    this.players = this.players.map((candidate) => (candidate.id === playerId ? changed : candidate));
    return changed;
  }
}

/** A name that is missing or null is left unchanged, as on the server. */
function namesOf({ displayName, realName }: UpdatePlayerNamesRequest): Partial<Player> {
  return { ...(displayName ? { displayName } : {}), ...(realName ? { realName } : {}) };
}
