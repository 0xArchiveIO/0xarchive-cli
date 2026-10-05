// Shared output for the commands built on the newer SDK resources: one JSON
// document on stdout, a file plus a short summary with --out, or a pretty view.

import { outputJson, prettyDim, prettyField, prettyHeader } from './output.js';
import { writeOutputFile } from './file.js';

export interface Page {
  data: unknown;
  nextCursor: string | null;
  /** True while another page follows: pass `nextCursor` back as `--cursor`. */
  has_more: boolean;
  meta?: Record<string, unknown>;
}

/**
 * Whether another page follows an SDK page. The SDK reads it from the API's
 * `meta.has_more` (`hasMore`); a result without it has more exactly when it
 * carries a cursor.
 */
export function hasMore(result: unknown): boolean {
  const r = (result ?? {}) as { hasMore?: unknown; nextCursor?: unknown; meta?: { hasMore?: unknown } };
  if (typeof r.hasMore === 'boolean') return r.hasMore;
  if (r.meta && typeof r.meta.hasMore === 'boolean') return r.meta.hasMore;
  return typeof r.nextCursor === 'string' && r.nextCursor !== '';
}

/** The JSON envelope of one page: `data`, `nextCursor` (null on the last page) and `has_more`. */
export function pageEnvelope<T>(
  result: { nextCursor?: string | null },
  data: T,
): { data: T; nextCursor: string | null; has_more: boolean } {
  return { data, nextCursor: result.nextCursor ?? null, has_more: hasMore(result) };
}

/** An SDK cursor page as the CLI's JSON envelope. `meta` is kept only when asked for. */
export function toPage(
  result: { data: unknown; nextCursor?: string; meta?: Record<string, unknown> },
  keepMeta = false,
): Page {
  const page: Page = pageEnvelope(result, result.data);
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
      has_more: page.has_more,
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

/** The "... and N more" and next-page footer under a pretty table. */
export function printMore(shown: number, total: number, page: { nextCursor?: string | null; has_more?: boolean }): void {
  if (total > shown) prettyDim(`... and ${total - shown} more`);
  printNextPage(page);
}

/**
 * The next-page hint in pretty output: the cursor to pass back while another
 * page follows. `result` is an SDK page or a CLI envelope.
 */
export function printNextPage(result: { nextCursor?: string | null; has_more?: boolean; hasMore?: boolean }): void {
  const more = typeof result.has_more === 'boolean' ? result.has_more : hasMore(result);
  if (!more) return;
  if (result.nextCursor) prettyDim(`More data available: rerun with --cursor ${result.nextCursor}`);
  else prettyDim('More data available');
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
