import type { EventApi } from '@/api/EventApi';
import type { EventInfo, JoinTeam } from '@/api/types';
import { makeEventInfo, makeJoinTeams } from '@/test/factories';
import { CallRecorder } from './CallRecorder';

/** In-memory `EventApi`. `failNext(error)` makes the next call reject; `calls` records what was called. */
export class FakeEventApi implements EventApi {
  event: EventInfo = makeEventInfo();
  joinTeams: JoinTeam[] = makeJoinTeams(3);
  /** The join code of every `getJoinTeams` call, in order. */
  readonly joinTeamCodes: string[] = [];

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
    this.joinTeamCodes.length = 0;
  }

  getEvent(): Promise<EventInfo> {
    return this.recorder.run('getEvent', () => this.event);
  }

  getJoinTeams(joinCode: string): Promise<JoinTeam[]> {
    this.joinTeamCodes.push(joinCode);
    return this.recorder.run('getJoinTeams', () => this.joinTeams);
  }
}
