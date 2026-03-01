import {
  resolveApiKey,
  validateExchange,
  createClient,
  getExchangeClient,
  type Exchange,
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
import { parseTimestamp, parseLimit } from '../lib/time.js';
import { writeOutputFile } from '../lib/file.js';

interface TradesFetchOptions {
  exchange: string;
  symbol: string;
  start?: string;
  end?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function tradesFetchCommand(options: TradesFetchOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
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
          'Example: oxa trades fetch --exchange hyperliquid --symbol BTC ' +
          '--start 2026-01-01T00:00:00Z --end 2026-01-01T01:00:00Z',
        EXIT.VALIDATION,
      );
    }

    // Lighter/HIP-3: use recent trades
    return fetchRecent(exchange, options.symbol, limit, apiKey, format, options.out);
  }

  // Range provided — parse and validate
  const start = parseTimestamp(options.start!, 'start');
  const end = parseTimestamp(options.end!, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  return fetchRange(exchange, options.symbol, start, end, limit, options.cursor, apiKey, format, options.out);
}

async function fetchRange(
  exchange: Exchange,
  symbol: string,
  start: number,
  end: number,
  limit: number | undefined,
  cursor: string | undefined,
  apiKey: string,
  format: string,
  outPath?: string,
): Promise<void> {
  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const result = await exchangeClient.trades.list(symbol, { start, end, limit, cursor });
    const trades = result.data;
    const envelope = { data: trades, nextCursor: result.nextCursor ?? null };

    if (outPath) {
      writeOutputFile(outPath, envelope);
      const summary = {
        written_to: outPath,
        records: trades.length,
        exchange,
        symbol,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${symbol} Trades (${exchange})`);
        prettyField('Records', trades.length);
        prettyField('Written to', outPath);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyPrintTrades(trades, symbol, exchange, result.nextCursor);
    } else {
      outputJson(envelope);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

async function fetchRecent(
  exchange: Exchange,
  symbol: string,
  limit: number | undefined,
  apiKey: string,
  format: string,
  outPath?: string,
): Promise<void> {
  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const trades = await exchangeClient.trades.recent(symbol, limit ?? 100);
    const envelope = { data: trades };

    if (outPath) {
      writeOutputFile(outPath, envelope);
      const summary = { written_to: outPath, records: trades.length, exchange, symbol };
      if (format === 'pretty') {
        prettyHeader(`${symbol} Recent Trades (${exchange})`);
        prettyField('Records', trades.length);
        prettyField('Written to', outPath);
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyPrintTrades(trades, symbol, exchange);
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
  nextCursor?: string,
): void {
  prettyHeader(`${symbol} Trades (${exchange}) — ${trades.length} records`);

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
  if (nextCursor) {
    prettyDim('More data available (use --cursor to paginate)');
  }
  process.stdout.write('\n');
}
