import type { Download } from '@/api/ApiClient';
import type { ArchiveApi } from '@/api/ArchiveApi';
import type { FinalizeResponse } from '@/api/types';
import { makeFinalizeResponse } from '@/test/factories';
import { CallRecorder } from './CallRecorder';

/** In-memory `ArchiveApi`. `failNext(error)` makes the next call reject; `calls` records what was called. */
export class FakeArchiveApi implements ArchiveApi {
  finalizeResponse: FinalizeResponse = makeFinalizeResponse();
  file: Download = { blob: new Blob(['{}']), fileName: 'buzzer-archive-2030.json' };

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

  exportArchive(): Promise<Download> {
    return this.recorder.run('exportArchive', () => this.file);
  }
}
