import { OxArchiveError } from '@0xarchive/sdk';
import { EXIT, exitError } from './output.js';

/**
 * Redact an API key by keeping the first 4 and last 4 characters.
 */
export function redactApiKey(key: string): string {
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

/**
 * Scrub an API key from a message string.
 */
function scrubKey(message: string, apiKey?: string): string {
  if (!apiKey) return message;
  // Replace all occurrences of the raw key with the redacted form
  return message.replaceAll(apiKey, redactApiKey(apiKey));
}

/**
 * Map an error to the appropriate exit code and message, then exit.
 */
export function handleError(error: unknown, apiKey?: string): never {
  if (error instanceof OxArchiveError) {
    const message = scrubKey(error.message, apiKey);
    if (error.code === 401 || error.code === 403) {
      exitError(message, EXIT.AUTH);
    }
    exitError(message, EXIT.NETWORK);
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    exitError(
      scrubKey('Network error: unable to reach the API. Check your connection.', apiKey),
      EXIT.NETWORK,
    );
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('enotfound')) {
      exitError(scrubKey(error.message, apiKey), EXIT.NETWORK);
    }
    exitError(scrubKey(error.message, apiKey), EXIT.INTERNAL);
  }

  exitError('An unknown error occurred', EXIT.INTERNAL);
}
