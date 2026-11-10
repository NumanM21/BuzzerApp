import type { ProblemDetails } from './types';

export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'network'
  | 'server';

export interface ApiErrorInit {
  /** The HTTP status, or 0 when no response arrived. */
  status: number;
  kind: ApiErrorKind;
  title?: string;
  detail?: string;
  fieldErrors?: Record<string, string[]>;
  retryAfterSeconds?: number;
}

// Used only when the server sent neither a `detail` nor a `title`.
const genericMessages: Record<ApiErrorKind, string> = {
  validation: 'Some of what was entered is not valid.',
  unauthorized: 'You need to sign in first.',
  forbidden: 'Only the host can do that.',
  notFound: 'That could not be found.',
  conflict: 'That conflicts with what is already there.',
  rateLimited: 'Too many tries. Wait a moment and try again.',
  network: 'Could not reach the server. Check your connection and try again.',
  server: 'Something went wrong on the server. Please try again.',
};

function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400:
      return 'validation';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    case 429:
      return 'rateLimited';
    default:
      // 405, 415, 5xx and anything else the app has no special handling for.
      return 'server';
  }
}

/**
 * Every failed call to the server, whatever went wrong. It extends `Error` because `Loadable.error` and
 * `Command.error` are `Error`s; a view model can show `message` as it is, because the server writes its `detail`
 * for the person using the app.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly title: string | undefined;
  readonly detail: string | undefined;
  /** Request field name → messages. Empty unless the server sent validation errors. */
  readonly fieldErrors: Record<string, string[]>;
  /** From the `Retry-After` header of a 429, in whole seconds. */
  readonly retryAfterSeconds: number | undefined;

  constructor(init: ApiErrorInit) {
    super(init.detail ?? init.title ?? genericMessages[init.kind]);
    this.name = 'ApiError';
    this.status = init.status;
    this.kind = init.kind;
    this.title = init.title;
    this.detail = init.detail;
    this.fieldErrors = init.fieldErrors ?? {};
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  /** `bodyText` is whatever the server sent: ProblemDetails JSON, or anything else (a proxy's HTML page, nothing). */
  static fromResponse(status: number, bodyText: string, retryAfterHeader: string | null): ApiError {
    const problem = parseProblem(bodyText);
    return new ApiError({
      status,
      kind: kindForStatus(status),
      title: problem.title,
      detail: problem.detail,
      fieldErrors: problem.errors,
      retryAfterSeconds: parseRetryAfter(retryAfterHeader),
    });
  }

  /** `fetch` rejected: the request never got an answer (offline, server down, connection dropped). */
  static network(): ApiError {
    return new ApiError({ status: 0, kind: 'network' });
  }

  /** The call succeeded but the body wasn't the JSON the app expects. */
  static unreadable(status: number): ApiError {
    return new ApiError({ status, kind: 'server' });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Takes only the fields it recognises, each checked, so a malformed body can never crash error handling. */
function parseProblem(bodyText: string): ProblemDetails {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return {};
  }
  if (!isRecord(body)) {
    return {};
  }
  const problem: ProblemDetails = {
    title: nonEmptyString(body.title),
    detail: nonEmptyString(body.detail),
  };
  if (isRecord(body.errors)) {
    const errors: Record<string, string[]> = {};
    for (const [field, messages] of Object.entries(body.errors)) {
      if (Array.isArray(messages)) {
        errors[field] = messages.filter((message): message is string => typeof message === 'string');
      }
    }
    problem.errors = errors;
  }
  return problem;
}

/** The server sends whole seconds. (HTTP also allows a date; the server doesn't, so that gives `undefined`.) */
function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) {
    return undefined;
  }
  return Number(header.trim());
}
