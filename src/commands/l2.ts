import {
  resolveApiKey,
  validateExchange,
  createClient,
  getExchangeClient,
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

// ── oxa l2 get ──────────────────────────────────────────────────────────

interface L2GetOptions {
  exchange: string;
  symbol: string;
  timestamp?: string;
  depth?: string;
  apiKey?: string;
  format: string;
}

export async function l2GetCommand(options: L2GetOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const depth = parsePositiveInt(options.depth, 'depth');

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const sdkParams: Record<string, unknown> = {};
    if (options.timestamp) sdkParams.timestamp = parseTimestamp(options.timestamp, 'timestamp');
    if (depth) sdkParams.depth = depth;

    const data = await (exchangeClient as any).l2Orderbook.get(options.symbol, sdkParams);

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} L2 Full-Depth Orderbook (${exchange})`);
      if (data.timestamp) prettyField('Timestamp', data.timestamp);
      if (data.asks) prettyField('Ask levels', data.ask_levels ?? data.asks.length);
      if (data.bids) prettyField('Bid levels', data.bid_levels ?? data.bids.length);
      if (data.bids?.[0]) prettyField('Best bid', `${data.bids[0].px} (${data.bids[0].n} orders)`);
      if (data.asks?.[0]) prettyField('Best ask', `${data.asks[0].px} (${data.asks[0].n} orders)`);
      process.stdout.write('\n');
    } else {
      outputJson(data);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa l2 history ──────────────────────────────────────────────────────

interface L2HistoryOptions {
  exchange: string;
  symbol: string;
  start: string;
  end: string;
  limit?: string;
  cursor?: string;
  depth?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function l2HistoryCommand(options: L2HistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
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
    const exchangeClient = getExchangeClient(client, exchange);
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (depth) sdkParams.depth = depth;
    if (options.cursor) sdkParams.cursor = options.cursor;

    const result = await (exchangeClient as any).l2Orderbook.history(options.symbol, sdkParams);
    const snapshots = result.data;
    const envelope = { data: snapshots, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: snapshots.length,
        exchange,
        symbol: options.symbol,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} L2 Orderbook History (${exchange})`);
        prettyField('Records', snapshots.length);
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} L2 Orderbook History (${exchange}) — ${snapshots.length} records`);
      if (snapshots.length === 0) {
        prettyDim('No L2 orderbook checkpoints found.');
      } else {
        prettyDim(`${snapshots.length} checkpoint records returned`);
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

// ── oxa l2 diffs ────────────────────────────────────────────────────────

interface L2DiffsOptions {
  exchange: string;
  symbol: string;
  start: string;
  end: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function l2DiffsCommand(options: L2DiffsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;

    const result = await (exchangeClient as any).l2Orderbook.diffs(options.symbol, sdkParams);
    const diffs = result.data;
    const envelope = { data: diffs, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: diffs.length,
        exchange,
        symbol: options.symbol,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} L2 Diffs (${exchange})`);
        prettyField('Records', diffs.length);
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} L2 Diffs (${exchange}) — ${diffs.length} records`);
      if (diffs.length === 0) {
        prettyDim('No L2 diffs found.');
      } else {
        prettyDim(`${diffs.length} diff records returned`);
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
