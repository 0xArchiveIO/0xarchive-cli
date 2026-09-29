// Shared output for the commands built on the newer SDK resources: one JSON
// document on stdout, a file plus a short summary with --out, or a pretty view.

import { outputJson, prettyDim, prettyField, prettyHeader } from './output.js';
import { writeOutputFile } from './file.js';

export interface Page {
  data: unknown;
  nextCursor: string | null;
  meta?: Record<string, unknown>;
}

/** An SDK cursor page as the CLI's JSON envelope. `meta` is kept only when asked for. */
export function toPage(
  result: { data: unknown; nextCursor?: string; meta?: Record<string, unknown> },
  keepMeta = false,
): Page {
  const page: Page = { data: result.data, nextCursor: result.nextCursor ?? null };
  if (keepMeta && result.meta && typeof result.meta === 'object') page.meta = result.meta;
  return page;
}

function recordCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  return data === null || data === undefined ? 0 : 1;
}

/**
 * Print a cursor page (or any document with `--out` support): the JSON envelope
 * on stdout, the file plus a summary with `--out`, or the pretty renderer.
 */
export function emitPage(
  page: Page,
  options: { format: string; out?: string },
  context: Record<string, unknown>,
  pretty: () => void,
): void {
  if (options.out) {
    writeOutputFile(options.out, page);
    const summary = {
      written_to: options.out,
      records: recordCount(page.data),
      ...context,
      has_more: page.nextCursor !== null,
      nextCursor: page.nextCursor,
    };
    if (options.format === 'pretty') {
      prettyHeader(`Written to ${options.out}`);
      prettyField('Records', summary.records);
      prettyField('Has more', summary.has_more ? 'yes' : 'no');
      process.stdout.write('\n');
    } else {
      outputJson(summary);
    }
    return;
  }
  if (options.format === 'pretty') {
    pretty();
    process.stdout.write('\n');
    return;
  }
  outputJson(page);
}

/** Print a single document (no cursor): JSON on stdout or the pretty renderer. */
export function emitDocument(data: unknown, options: { format: string }, pretty: () => void): void {
  if (options.format === 'pretty') {
    pretty();
    process.stdout.write('\n');
    return;
  }
  outputJson(data);
}

/** The "... and N more" and "use --cursor" footer under a pretty table. */
export function printMore(shown: number, total: number, nextCursor: string | null): void {
  if (total > shown) prettyDim(`... and ${total - shown} more`);
  if (nextCursor) prettyDim('More data available (use --cursor to paginate)');
}

/** Read a field that may arrive camelCase (SDK) or snake_case (raw API). */
export function field(obj: unknown, ...keys: string[]): unknown {
  if (obj === null || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

/** A table cell. Missing values read "-"; null percentages stay visible as "null". */
export function cell(value: unknown): string {
  if (value === undefined || value === '') return '-';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Unix ms (or an ISO string) as ISO 8601 for pretty output. */
export function isoTime(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return cell(value);
}
