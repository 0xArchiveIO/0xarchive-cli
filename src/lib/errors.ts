import { OxArchiveError } from '@0xarchive/sdk';
import { EXIT, exitError, type ApiErrorFields } from './output.js';

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
 * API error codes that mean the request itself was refused: a parameter, the
 * symbol, the interval, the cursor or the time range is wrong, or the venue
 * does not serve the datatype. The command needs changing; retrying it will
 * not help. Exit code 2, like the CLI's own argument checks.
 */
export const REQUEST_ERROR_CODES: ReadonlySet<string> = new Set([
  'invalid_parameter',
  'invalid_symbol',
  'invalid_interval',
  'invalid_cursor',
  'invalid_time_range',
  'range_before_coverage',
  'unsupported_for_venue',
  'route_not_found',
  'not_found',
  // Codes the API sends to clients that do not select an API version.
  'invalid_query_params',
  'invalid_path_params',
]);

/**
 * API error codes about the key or the plan: authentication, permissions,
 * plan history limits, credits and key or wallet limits. Exit code 3.
 */
export const ACCESS_ERROR_CODES: ReadonlySet<string> = new Set([
  'unauthorized',
  'forbidden',
  'insufficient_scope',
  'account_disabled',
  'oauth_not_permitted',
  'historical_range_exceeded',
  'historical_depth_exceeded',
  'insufficient_credits',
  'api_key_limit_reached',
  'wallet_requires_plan',
  'wallet_account_required',
  'wallet_free_signup_retired',
  // Codes the API sends to clients that do not select an API version.
  'history_window_exceeded',
  'request_range_exceeded',
]);

/**
 * The exit code for an API failure. The stable `error_code` decides when the
 * API sent one: request errors exit 2, key and plan errors exit 3, and every
 * other code (rate limits, conflicts, upstream and internal errors, WebSocket
 * `slow_consumer`) exits 4. Without a code, HTTP 401 and 403 exit 3 and the
 * rest exit 4.
 */
export function exitCodeForApiError(errorCode: string | undefined, status?: number): number {
  if (errorCode !== undefined) {
    if (REQUEST_ERROR_CODES.has(errorCode)) return EXIT.VALIDATION;
    if (ACCESS_ERROR_CODES.has(errorCode)) return EXIT.AUTH;
    return EXIT.NETWORK;
  }
  if (status === 401 || status === 403) return EXIT.AUTH;
  return EXIT.NETWORK;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The API fields of an SDK error: `errorCode`, `requestId`, `param`,
 * `validValues`, and the HTTP status when the error came from a response.
 * Read by name so an SDK release that predates a field still type-checks.
 */
export function apiErrorFields(error: OxArchiveError): ApiErrorFields {
  const e = error as OxArchiveError & {
    errorCode?: unknown;
    requestId?: unknown;
    param?: unknown;
    validValues?: unknown;
  };
  const errorCode = stringOrUndefined(e.errorCode);
  const requestId = stringOrUndefined(e.requestId);
  const validValues = Array.isArray(e.validValues)
    ? e.validValues.filter((v): v is string => typeof v === 'string')
    : undefined;
  return {
    error_code: errorCode,
    request_id: requestId,
    // A status is reported only for a failure the API answered. A network
    // failure or timeout also surfaces as an SDK error with a status, but
    // carries neither a code nor a request id.
    status: errorCode !== undefined || requestId !== undefined ? e.code : undefined,
    param: stringOrUndefined(e.param),
    valid_values: validValues && validValues.length > 0 ? validValues : undefined,
  };
}

/**
 * Map an error to the appropriate exit code and message, then exit. API
 * failures print the API's `error_code` and `request_id` beside the message.
 */
export function handleError(error: unknown, apiKey?: string): never {
  if (error instanceof OxArchiveError) {
    const fields = apiErrorFields(error);
    exitError(scrubKey(error.message, apiKey), exitCodeForApiError(fields.error_code, error.code), fields);
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

/**
 * Exit on a WebSocket `{"type":"error"}` message. The message's `error_code`
 * (sent by the API on every error) is printed and picks the exit code, as for
 * REST failures.
 */
export function exitWsError(prefix: string, message: { message?: unknown; error_code?: unknown; errorCode?: unknown }): never {
  const errorCode = stringOrUndefined(message.error_code) ?? stringOrUndefined(message.errorCode);
  exitError(`${prefix}: ${String(message.message ?? 'unknown error')}`, exitCodeForApiError(errorCode), {
    error_code: errorCode,
  });
}
