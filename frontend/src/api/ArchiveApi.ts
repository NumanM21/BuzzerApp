import type { ApiClient } from './ApiClient';
import type { FinalizeResponse } from './types';

export interface ArchiveApi {
  /** Admin only. Can be repeated: it replaces the archive. */
  finalize(): Promise<FinalizeResponse>;
  /**
   * The address the browser downloads the archive file from (it contains real names, so the app never fetches it
   * itself: no copy in memory or storage). Admin only; the server answers `404` until the event is finalized.
   */
  exportUrl(eventId: number): string;
}

export class HttpArchiveApi implements ArchiveApi {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  finalize(): Promise<FinalizeResponse> {
    return this.client.post<FinalizeResponse>('/api/archive/finalize');
  }

  exportUrl(eventId: number): string {
    return `/api/archive/${eventId}/export`;
  }
}
