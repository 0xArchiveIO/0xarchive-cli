import {
  resolveApiKey,
  validateExchange,
  createClient,
  type Exchange,
} from '../lib/client.js';
import {
  outputJson,
  validateFormat,
  prettyHeader,
  prettyField,
  prettyDim,
  EXIT,
  exitError,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp, parseLimit, parsePositiveInt } from '../lib/time.js';
import { writeOutputFile } from '../lib/file.js';

// ── oxa l3 get ──────────────────────────────────────────────────────────

interface L3GetOptions {
  symbol: string;
  depth?: string;
  apiKey?: string;
  format: string;
}

export async function l3GetCommand(options: L3GetOptions): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const depth = parsePositiveInt(options.depth, 'depth');

  const client = createClient(apiKey);

  try {
    const sdkParams = depth ? { depth } : undefined;
    const data = await (client.lighter as any).l3Orderbook.get(options.symbol, sdkParams);

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} L3 Orderbook (lighter)`);
      if (data.timestamp) prettyField('Timestamp', data.timestamp);
      if (data.asks) prettyField('Ask levels', data.asks.length);
      if (data.bids) prettyField('Bid levels', data.bids.length);
      process.stdout.write('\n');
    } else {
      outputJson(data);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa l3 history ──────────────────────────────────────────────────────

interface L3HistoryOptions {
  symbol: string;
  start: string;
  end: string;
  depth?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function l3HistoryCommand(options: L3HistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);
  const depth = parsePositiveInt(options.depth, 'depth');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;
    if (depth) sdkParams.depth = depth;

    const result = await (client.lighter as any).l3Orderbook.history(options.symbol, sdkParams);
    const snapshots = result.data;
    const envelope = { data: snapshots, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: snapshots.length,
        exchange: 'lighter',
        symbol: options.symbol,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} L3 Orderbook History (lighter)`);
        prettyField('Records', snapshots.length);
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} L3 Orderbook History (lighter) — ${snapshots.length} records`);
      if (snapshots.length === 0) {
        prettyDim('No L3 orderbook snapshots found.');
      } else {
        prettyDim(`${snapshots.length} snapshot records returned`);
        if (result.nextCursor) prettyDim('More data available (use --cursor to paginate)');
      }
      process.stdout.write('\n');
    } else {
      outputJson(envelope);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
