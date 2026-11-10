import type { ApiError } from '@/api/ApiError';

/**
 * Tells a failed server call (which has a `kind`, `fieldErrors` and so on) from any other error. A view model may
 * import API *types* but not the `ApiError` class itself, so `instanceof` isn't available there; the class sets its
 * `name` for exactly this check.
 */
export function isApiError(reason: unknown): reason is ApiError {
  return reason instanceof Error && reason.name === 'ApiError';
}
