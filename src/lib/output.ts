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

/**
 * Write error to stderr and exit with the given code.
 */
const EXIT_LABELS: Record<number, string> = {
  [EXIT.VALIDATION]: 'validation',
  [EXIT.AUTH]: 'auth',
  [EXIT.NETWORK]: 'network',
  [EXIT.INTERNAL]: 'internal',
};

export function exitError(message: string, code: number): never {
  const payload = JSON.stringify({
    error: message,
    code,
    type: EXIT_LABELS[code] ?? 'unknown',
  });
  process.stderr.write(payload + '\n');
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

export function prettyTable(
  headers: string[],
  rows: string[][],
  colWidths?: number[],
): void {
  const widths =
    colWidths ||
    headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => (r[i] || '').length)),
    );

  const headerLine = headers
    .map((h, i) => chalk.bold(h.padEnd(widths[i])))
    .join('  ');
  const separator = widths.map((w) => '─'.repeat(w)).join('──');

  process.stdout.write('  ' + headerLine + '\n');
  process.stdout.write('  ' + separator + '\n');
  for (const row of rows) {
    const line = row.map((cell, i) => cell.padEnd(widths[i])).join('  ');
    process.stdout.write('  ' + line + '\n');
  }
}

export function prettyDim(text: string): void {
  process.stdout.write(chalk.dim('  ' + text) + '\n');
}
