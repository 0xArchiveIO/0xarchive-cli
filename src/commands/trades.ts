import {
  resolveApiKey,
  validateVenue,
  createClient,
  getExchangeClient,
  isLighterExchange,
  sdkTooOld,
  type Venue,
} from '../lib/client.js';
import {
  outputJson,
  validateFormat,
  prettyHeader,
  prettyField,
  prettyTable,
  prettyDim,
  EXIT,
  exitError,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { hasMore, printNextPage } from '../lib/emit.js';
import { exampleRange, parseTimestamp, parseLimit } from '../lib/time.js';
import { parseChoice } from '../lib/params.js';
import { writeOutputFile } from '../lib/file.js';

/** `--side` values: the taker side of each trade, filtered by the API. */
export const TRADE_SIDES = ['buy', 'sell'] as const;
export type TradeSide = (typeof TRADE_SIDES)[number];

interface TradesFetchOptions {
  exchange: string;
  symbol: string;
  start?: string;
  end?: string;
  limit?: string;
  cursor?: string;
  side?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

/** The trades resource the command calls, on every venue client. */
interface TradesResource {
  list(symbol: string, params: Record<string, unknown>): Promise<{
    data: any[];
    nextCursor?: string;
    hasMore?: boolean;
    meta?: Record<string, unknown>;
  }>;
  recent(symbol: string, limitOrParams?: number | { limit?: number; side?: TradeSide }): Promise<any[]>;
  history?: unknown;
}

/**
 * `oxa trades history` (also `oxa trades fetch`): trade history over a range,
 * or the most recent trades when no range is given on a venue with a recent
 * route (every venue except Hyperliquid core).
 */
export async function tradesFetchCommand(options: TradesFetchOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateVenue(options.exchange);
  const side = parseChoice(options.side, 'side', TRADE_SIDES);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);

  // Validate start/end pair
  const hasStart = options.start !== undefined;
  const hasEnd = options.end !== undefined;

  if (hasStart !== hasEnd) {
    exitError(
      'Both --start and --end are required when specifying a time range.',
      EXIT.VALIDATION,
    );
  }

  if (!hasStart && !hasEnd) {
    // No range provided
    if (exchange === 'hyperliquid') {
      exitError(
        'Hyperliquid trades require a time range. Provide --start and --end.\n' +
          'Example: oxa trades history --exchange hyperliquid --symbol BTC ' +
          exampleRange(1),
        EXIT.VALIDATION,
      );
    }

    // Lighter (both deployments), HIP-3, HIP-4 and Spot: the recent tier. On
    // Lighter it is preliminary until the finalization watermark passes it.
    return fetchRecent(exchange, options.symbol, limit, side, apiKey, format, options.out);
  }

  // Range provided: parse and validate
  const start = parseTimestamp(options.start!, 'start');
  const end = parseTimestamp(options.end!, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  return fetchRange(exchange, options.symbol, start, end, limit, options.cursor, side, apiKey, format, options.out);
}

function tradesResource(exchange: Venue, apiKey: string): TradesResource {
  const client = createClient(apiKey);
  if (exchange === 'spot') return client.spot.trades as unknown as TradesResource;
  return getExchangeClient(client, exchange, apiKey).trades as unknown as TradesResource;
}

async function fetchRange(
  exchange: Venue,
  symbol: string,
  start: number,
  end: number,
  limit: number | undefined,
  cursor: string | undefined,
  side: TradeSide | undefined,
  apiKey: string,
  format: string,
  outPath?: string,
): Promise<void> {
  const trades = tradesResource(exchange, apiKey);
  try {
    const params: Record<string, unknown> = { start, end, limit, cursor };
    if (side) params.side = side;
    const result = await trades.list(symbol, params);
    const rows = result.data;
    const more = hasMore(result);
    // Lighter ranges (both deployments) are clamped to the finalization
    // watermark; the SDK surfaces that as meta (finalized_through,
    // clamped_to), passed through. Other exchanges keep their output as is.
    const meta = isLighterExchange(exchange) ? responseMeta(result) : undefined;
    const envelope = {
      data: rows,
      nextCursor: result.nextCursor ?? null,
      has_more: more,
      ...(meta ? { meta } : {}),
    };

    if (outPath) {
      writeOutputFile(outPath, rows);
      const summary = {
        written_to: outPath,
        records: rows.length,
        exchange,
        symbol,
        has_more: more,
        nextCursor: result.nextCursor ?? null,
        ...(meta ? { meta } : {}),
      };
      if (format === 'pretty') {
        prettyHeader(`${symbol} Trades (${exchange})`);
        prettyField('Records', rows.length);
        prettyField('Written to', outPath);
        prettyField('Has more', more ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyPrintTrades(rows, symbol, exchange, envelope, meta);
    } else {
      outputJson(envelope);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

async function fetchRecent(
  exchange: Venue,
  symbol: string,
  limit: number | undefined,
  side: TradeSide | undefined,
  apiKey: string,
  format: string,
  outPath?: string,
): Promise<void> {
  const trades = tradesResource(exchange, apiKey);
  // The `{ limit, side }` form of recent() arrived with the SDK release that
  // added trades.history(); without a side the plain limit works on every
  // release. HIP-4 goes through the CLI's own client, which takes both.
  if (side && exchange !== 'hip4' && typeof trades.history !== 'function') {
    sdkTooOld('--side on recent trades');
  }
  try {
    const rows = side ? await trades.recent(symbol, { limit: limit ?? 100, side }) : await trades.recent(symbol, limit ?? 100);
    const envelope = { data: rows };

    if (outPath) {
      writeOutputFile(outPath, rows);
      const summary = { written_to: outPath, records: rows.length, exchange, symbol };
      if (format === 'pretty') {
        prettyHeader(`${symbol} Recent Trades (${exchange})`);
        prettyField('Records', rows.length);
        prettyField('Written to', outPath);
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyPrintTrades(rows, symbol, exchange);
    } else {
      outputJson(envelope);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

function prettyPrintTrades(
  trades: Array<{
    timestamp: string;
    side: string;
    price: string;
    size: string;
  }>,
  symbol: string,
  exchange: string,
  page?: { nextCursor: string | null; has_more: boolean },
  meta?: Record<string, unknown>,
): void {
  prettyHeader(`${symbol} Trades (${exchange}): ${trades.length} records`);
  if (meta) {
    prettyField('Finalized through', metaString(meta, 'finalizedThrough', 'finalized_through'));
    prettyField('Clamped to', metaString(meta, 'clampedTo', 'clamped_to'));
  }

  if (trades.length === 0) {
    prettyDim('No trades found.');
    process.stdout.write('\n');
    return;
  }

  const preview = trades.slice(0, 20);
  const rows = preview.map((t) => [
    t.timestamp,
    t.side === 'B' ? 'BUY' : 'SELL',
    t.price,
    t.size,
  ]);
  prettyTable(['Timestamp', 'Side', 'Price', 'Size'], rows);

  if (trades.length > 20) {
    prettyDim(`... and ${trades.length - 20} more`);
  }
  if (page) printNextPage(page);
  process.stdout.write('\n');
}

function responseMeta(result: unknown): Record<string, unknown> | undefined {
  const meta = (result as { meta?: unknown } | null)?.meta;
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : undefined;
}

function metaString(meta: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = meta[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return undefined;
}
