import type { ArchiveApi } from '@/api/ArchiveApi';
import type { FinalizeResponse } from '@/api/types';
import { makeFinalizeResponse } from '@/test/factories';
import { CallRecorder } from './CallRecorder';

/** In-memory `ArchiveApi`. `failNext(error)` makes the next call reject; `calls` records what was called. */
export class FakeArchiveApi implements ArchiveApi {
  finalizeResponse: FinalizeResponse = makeFinalizeResponse();

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

  finalize(): Promise<FinalizeResponse> {
    return this.recorder.run('finalize', () => this.finalizeResponse);
  }

  // Not a call: a link is only an address, so nothing is recorded.
  exportUrl(eventId: number): string {
    return `/api/archive/${eventId}/export`;
  }
}
