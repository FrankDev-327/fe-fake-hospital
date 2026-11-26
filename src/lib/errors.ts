import { ApiError } from './api';
import { t } from '@/i18n';

/**
 * Turns an API error into a sentence for the user. Each screen passes the backend error codes
 * it expects (e.g. { stale_version: 'Someone else changed this...' }); everything else gets a
 * generic message.
 */
export function errorMessage(
  error: unknown,
  messages: Record<string, string> = {},
): string {
  if (!(error instanceof ApiError)) return t('errors.generic');
  if (error.code && messages[error.code]) return messages[error.code]!;
  if (error.isUnavailable) return t('errors.unavailable');
  if (error.status === 403) return t('errors.forbidden');
  if (error.status === 404) return t('errors.notFound');
  if (error.code === 'validation_failed') return t('errors.invalid');
  return t('errors.generic');
}
