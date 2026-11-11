/**
 * JavaScript can throw anything, not only `Error`. View models expose errors as `Error` so a view can always show
 * `error.message`; an `Error` subclass (such as `ApiError`) passes through unchanged.
 */
export function toError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  return new Error(typeof reason === 'string' && reason.length > 0 ? reason : 'Something went wrong.');
}
