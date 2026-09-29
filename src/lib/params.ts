import { exitError, EXIT } from './output.js';
import { listOr } from './client.js';

// Decimal forms only: Number() alone would also take hex (0x10), binary, and
// whitespace-padded values.
const INTEGER_RE = /^[+-]?\d+$/;
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** An optional whole number within [min, max]. */
export function parseIntInRange(
  raw: string | undefined,
  flag: string,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!INTEGER_RE.test(raw) || !Number.isInteger(n) || n < min || n > max) {
    exitError(`--${flag} must be a whole number from ${min} to ${max} (got ${raw})`, EXIT.VALIDATION);
  }
  return n;
}

/** An optional number within [min, max]. */
export function parseNumberInRange(
  raw: string | undefined,
  flag: string,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!NUMBER_RE.test(raw) || !Number.isFinite(n) || n < min || n > max) {
    exitError(`--${flag} must be a number from ${min} to ${max} (got ${raw})`, EXIT.VALIDATION);
  }
  return n;
}

/** An optional non-negative number (no upper bound). */
export function parseNonNegative(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!NUMBER_RE.test(raw) || !Number.isFinite(n) || n < 0) {
    exitError(`--${flag} must be a non-negative number (got ${raw})`, EXIT.VALIDATION);
  }
  return n;
}

/** An optional non-negative whole number (no upper bound). */
export function parseNonNegativeInt(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!INTEGER_RE.test(raw) || !Number.isSafeInteger(n) || n < 0) {
    exitError(`--${flag} must be a non-negative whole number (got ${raw})`, EXIT.VALIDATION);
  }
  return n;
}

/** An optional `true` / `false` flag value. */
export function parseBoolean(raw: string | undefined, flag: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  exitError(`--${flag} must be true or false (got ${raw})`, EXIT.VALIDATION);
}

/** An optional value from a fixed list. */
export function parseChoice<T extends string>(
  raw: string | undefined,
  flag: string,
  choices: readonly T[],
): T | undefined {
  if (raw === undefined) return undefined;
  if (!choices.includes(raw as T)) {
    exitError(`Invalid --${flag} "${raw}". Must be ${listOr(choices)}.`, EXIT.VALIDATION);
  }
  return raw as T;
}
