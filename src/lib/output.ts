import chalk from 'chalk';

export const EXIT = {
  SUCCESS: 0,
  VALIDATION: 2,
  AUTH: 3,
  NETWORK: 4,
  INTERNAL: 5,
} as const;

export type Format = 'json' | 'pretty';

export function validateFormat(format: string): Format {
  if (format !== 'json' && format !== 'pretty') {
    exitError(
      `Invalid format "${format}". Must be "json" or "pretty".`,
      EXIT.VALIDATION,
    );
  }
  return format;
}

/**
 * Write result payload to stdout. This is the only stdout output.
 */
export function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

const EXIT_LABELS: Record<number, string> = {
  [EXIT.VALIDATION]: 'validation',
  [EXIT.AUTH]: 'auth',
  [EXIT.NETWORK]: 'network',
  [EXIT.INTERNAL]: 'internal',
};

/**
 * What the API said about a failed request, added to the error line when the
 * failure came from the API: the stable `error_code`, the `request_id` to
 * quote to support, the HTTP `status`, and the refused parameter with the
 * values it accepts.
 */
export interface ApiErrorFields {
  error_code?: string;
  request_id?: string;
  status?: number;
  param?: string;
  valid_values?: string[];
}

/**
 * Write the error to stderr as one JSON line and exit with the given code.
 * `code` is the exit code and `type` its class; API failures add the fields
 * of {@link ApiErrorFields} that the API sent.
 */
export function exitError(message: string, code: number, api?: ApiErrorFields): never {
  const payload: Record<string, unknown> = {
    error: message,
    code,
    type: EXIT_LABELS[code] ?? 'unknown',
  };
  if (api) {
    for (const [key, value] of Object.entries(api)) {
      if (value !== undefined && value !== null && value !== '') payload[key] = value;
    }
  }
  process.stderr.write(JSON.stringify(payload) + '\n');
  process.exit(code);
}

// ── Pretty formatters ───────────────────────────────────────────────────

export function prettySuccess(label: string): void {
  process.stdout.write(chalk.green('✓') + ' ' + label + '\n');
}

export function prettyHeader(title: string): void {
  process.stdout.write('\n' + chalk.bold(title) + '\n');
}

export function prettyField(label: string, value: string | number | undefined | null): void {
  if (value === undefined || value === null) return;
  process.stdout.write('  ' + chalk.dim(label + ':') + ' ' + String(value) + '\n');
}

/** Shown in a table cell that has no value. */
export const EMPTY_CELL = '-';

/**
 * Write a number as plain decimal digits. JavaScript switches to exponent
 * notation below 1e-6 and from 1e21; a table shows the digits instead, with
 * every significant digit kept.
 */
export function formatNumber(value: number): string {
  const text = String(value);
  if (!Number.isFinite(value) || !/e/i.test(text)) return text;
  return value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
}

/**
 * The text of one table cell. API rows carry strings, numbers, booleans and
 * nulls, so every cell is converted here: a number keeps all its digits, a
 * missing value shows as {@link EMPTY_CELL}, and an object or array is
 * written as JSON.
 */
export function formatCell(value: unknown): string {
  if (value === undefined || value === null) return EMPTY_CELL;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

export function prettyTable(
  headers: string[],
  rows: readonly (readonly unknown[])[],
  colWidths?: number[],
): void {
  const cells = rows.map((row) => headers.map((_, i) => formatCell(row[i])));
  const widths =
    colWidths ||
    headers.map((h, i) => Math.max(h.length, ...cells.map((r) => r[i].length)));

  const headerLine = headers
    .map((h, i) => chalk.bold(h.padEnd(widths[i])))
    .join('  ');
  const separator = widths.map((w) => '─'.repeat(w)).join('──');

  process.stdout.write('  ' + headerLine + '\n');
  process.stdout.write('  ' + separator + '\n');
  for (const row of cells) {
    const line = row.map((cell, i) => cell.padEnd(widths[i])).join('  ');
    process.stdout.write('  ' + line + '\n');
  }
}

export function prettyDim(text: string): void {
  process.stdout.write(chalk.dim('  ' + text) + '\n');
}
