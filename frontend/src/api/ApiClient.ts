import { ApiError } from './ApiError';

export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  /**
   * For calls made without a session (event info, join teams, register, sign in, and `/me`, whose caller reads a
   * 401 as "not signed in"). A 401 on such a call is an ordinary answer, not "your session has ended".
   */
  anonymous?: boolean;
  /** Appended to the path as a query string; `undefined` values are left out. */
  query?: Record<string, string | number | undefined>;
}

export interface Download {
  blob: Blob;
  /** From the `Content-Disposition` header, when the server names the file. */
  fileName: string | undefined;
}

/**
 * The only place that calls `fetch`. Paths are relative (`/api/...`): the built app is served by the API from the
 * same origin, so there is no base URL and no CORS, and the browser sends the session cookie by itself.
 *
 * Every failure, from a network drop to a 400 with field errors, arrives as an `ApiError`.
 */
export class ApiClient {
  private readonly fetchFunction: FetchFunction;
  private readonly onSessionExpired: () => void;

  /**
   * `fetchFunction` is injected so a test passes a fake. `onSessionExpired` runs when a call that needs a session
   * gets a 401, which means the cookie is gone or no longer valid.
   */
  constructor(fetchFunction: FetchFunction, onSessionExpired: () => void) {
    this.fetchFunction = fetchFunction;
    this.onSessionExpired = onSessionExpired;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.requestJson<T>('GET', path, undefined, options);
  }

  post<T = void>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.requestJson<T>('POST', path, body, options);
  }

  patch<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.requestJson<T>('PATCH', path, body, options);
  }

  delete<T = void>(path: string, options?: RequestOptions): Promise<T> {
    return this.requestJson<T>('DELETE', path, undefined, options);
  }

  /** For a route that answers with a file rather than JSON (the archive export). */
  async download(path: string, options?: RequestOptions): Promise<Download> {
    const response = await this.send('GET', path, undefined, options);
    try {
      return {
        blob: await response.blob(),
        fileName: fileNameFrom(response.headers.get('Content-Disposition')),
      };
    } catch {
      throw ApiError.network();
    }
  }

  private async requestJson<T>(method: string, path: string, body: unknown, options?: RequestOptions): Promise<T> {
    const response = await this.send(method, path, body, options);
    let text: string;
    try {
      text = await response.text();
    } catch {
      // The connection dropped while the body was arriving.
      throw ApiError.network();
    }
    // 204, and any success with no body, has nothing to read: the call's type says `void` for those.
    if (response.status === 204 || text.length === 0) {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw ApiError.unreadable(response.status);
    }
  }

  /** Sends the request and returns the response if it is a success; otherwise throws the matching `ApiError`. */
  private async send(method: string, path: string, body: unknown, options?: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const init: RequestInit = { method, headers, credentials: 'same-origin' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await this.fetchFunction(withQuery(path, options?.query), init);
    } catch {
      // `fetch` rejects only when no answer came back at all; a 4xx or 5xx is a resolved response.
      throw ApiError.network();
    }

    if (response.ok) {
      return response;
    }

    // Read first, so a body that fails to arrive doesn't hide the status the caller needs.
    const text = await response.text().catch(() => '');
    if (response.status === 401 && !options?.anonymous) {
      this.onSessionExpired();
    }
    throw ApiError.fromResponse(response.status, text, response.headers.get('Retry-After'));
  }
}

function withQuery(path: string, query: RequestOptions['query']): string {
  if (!query) {
    return path;
  }
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) {
      parameters.set(name, String(value));
    }
  }
  const text = parameters.toString();
  return text.length > 0 ? `${path}?${text}` : path;
}

/** Reads `filename="x"` or `filename=x`; the server's file names are plain ASCII, so `filename*=` isn't handled. */
function fileNameFrom(contentDisposition: string | null): string | undefined {
  const match = contentDisposition ? /filename="?([^";]+)"?/i.exec(contentDisposition) : null;
  return match?.[1];
}
