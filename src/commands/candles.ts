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
  prettyTable,
  prettyDim,
  EXIT,
  exitError,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp, parseLimit, validateCandleInterval } from '../lib/time.js';
import { writeOutputFile } from '../lib/file.js';

interface CandlesOptions {
  exchange: string;
  symbol: string;
  interval?: string;
  start?: string;
  end?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function candlesCommand(options: CandlesOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  const interval = validateCandleInterval(options.interval);

  // Candles always require a time range
  if (!options.start || !options.end) {
    exitError(
      'Candles require --start and --end.\n' +
        'Example: oxa candles --exchange hyperliquid --symbol BTC ' +
        '--start 2026-01-01T00:00:00Z --end 2026-01-02T00:00:00Z --interval 1h',
      EXIT.VALIDATION,
    );
  }

  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const result = await exchangeClient.candles.history(options.symbol, {
      start,
      end,
      limit,
      cursor: options.cursor,
      interval,
    });
    const candles = result.data;
    const envelope = { data: candles, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: candles.length,
        exchange,
        symbol: options.symbol,
        interval: interval ?? '1h',
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} Candles (${exchange})`);
        prettyField('Records', candles.length);
        prettyField('Interval', interval ?? '1h');
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} Candles (${exchange}) — ${candles.length} records`);
      prettyField('Interval', interval ?? '1h');

      if (candles.length === 0) {
        prettyDim('No candles found.');
      } else {
        const preview = candles.slice(0, 20);
        const rows = preview.map((c: any) => [
          c.timestamp,
          c.open,
          c.high,
          c.low,
          c.close,
          c.volume,
        ]);
        prettyTable(['Timestamp', 'Open', 'High', 'Low', 'Close', 'Volume'], rows);

        if (candles.length > 20) {
          prettyDim(`... and ${candles.length - 20} more`);
        }
        if (result.nextCursor) {
          prettyDim('More data available (use --cursor to paginate)');
        }
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
