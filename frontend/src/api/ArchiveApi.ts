import type { ApiClient, Download } from './ApiClient';
import type { FinalizeResponse } from './types';

export interface ArchiveApi {
  /** Admin only. Can be repeated: it replaces the archive. */
  finalize(): Promise<FinalizeResponse>;
  /** Admin only. The archive file (it contains real names). Rejects with `notFound` if it isn't finalized. */
  exportArchive(eventId: number): Promise<Download>;
}

export class HttpArchiveApi implements ArchiveApi {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  finalize(): Promise<FinalizeResponse> {
    return this.client.post<FinalizeResponse>('/api/archive/finalize');
  }

  exportArchive(eventId: number): Promise<Download> {
    return this.client.download(`/api/archive/${eventId}/export`);
  }
}
