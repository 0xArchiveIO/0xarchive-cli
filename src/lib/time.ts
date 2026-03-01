import { exitError, EXIT } from './output.js';

/**
 * Parse a timestamp string to Unix ms.
 * Accepts ISO 8601 strings or Unix ms integers.
 * Always returns a number (Unix ms) for the API.
 */
export function parseTimestamp(value: string, label: string): number {
  // If it looks like an ISO date string, parse to Unix ms
  if (/^\d{4}-\d{2}/.test(value)) {
    const ms = new Date(value).getTime();
    if (isNaN(ms)) {
      exitError(`--${label} is not a valid ISO 8601 date: "${value}"`, EXIT.VALIDATION);
    }
    return ms;
  }
  // Otherwise treat as Unix ms
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) {
    exitError(`--${label} must be a valid ISO date or Unix timestamp (ms)`, EXIT.VALIDATION);
  }
  return n;
}

/**
 * Parse and validate a --limit flag.
 */
export function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) {
    exitError('--limit must be a positive integer', EXIT.VALIDATION);
  }
  return n;
}

/**
 * Parse and validate a positive integer flag.
 */
export function parsePositiveInt(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) {
    exitError(`--${label} must be a positive integer`, EXIT.VALIDATION);
  }
  return n;
}

const VALID_INTERVALS = ['5m', '15m', '30m', '1h', '4h', '1d'] as const;
const VALID_CANDLE_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;

export type Interval = (typeof VALID_INTERVALS)[number];
export type CandleInterval = (typeof VALID_CANDLE_INTERVALS)[number];

/**
 * Validate an aggregation interval for funding/OI/prices.
 */
export function validateInterval(value: string | undefined): Interval | undefined {
  if (value === undefined) return undefined;
  if (!VALID_INTERVALS.includes(value as Interval)) {
    exitError(
      `Invalid interval "${value}". Must be one of: ${VALID_INTERVALS.join(', ')}`,
      EXIT.VALIDATION,
    );
  }
  return value as Interval;
}

/**
 * Validate a candle interval.
 */
export function validateCandleInterval(value: string | undefined): CandleInterval | undefined {
  if (value === undefined) return undefined;
  if (!VALID_CANDLE_INTERVALS.includes(value as CandleInterval)) {
    exitError(
      `Invalid interval "${value}". Must be one of: ${VALID_CANDLE_INTERVALS.join(', ')}`,
      EXIT.VALIDATION,
    );
  }
  return value as CandleInterval;
}
