import { ApiError } from './api';

/**
 * Turns an API error into a sentence for the user. Each screen passes the backend error codes
 * it expects (e.g. { stale_version: 'Someone else changed this...' }); everything else gets a
 * generic message.
 */
export function errorMessage(
  error: unknown,
  messages: Record<string, string> = {},
): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.';
  if (error.code && messages[error.code]) return messages[error.code]!;
  if (error.isUnavailable)
    return 'This service is unavailable right now. Try again in a moment.';
  if (error.status === 403) return "You're not allowed to do this.";
  if (error.status === 404) return 'Not found (it may have been removed).';
  if (error.code === 'validation_failed') return 'Some fields are not valid.';
  return 'Something went wrong. Try again.';
}
