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
  prettyTable,
  prettyDim,
  EXIT,
  exitError,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp, parseLimit, validateInterval } from '../lib/time.js';

interface PricesOptions {
  exchange: string;
  symbol: string;
  interval?: string;
  start?: string;
  end?: string;
  limit?: string;
  cursor?: string;
  apiKey?: string;
  format: string;
}

export async function pricesCommand(options: PricesOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  const interval = validateInterval(options.interval);

  if (!options.start || !options.end) {
    exitError(
      'Price history requires --start and --end.\n' +
        'Example: oxa prices --exchange hyperliquid --symbol BTC ' +
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
    const result = await exchangeClient.priceHistory(options.symbol, {
      start,
      end,
      limit,
      cursor: options.cursor,
      interval,
    });
    const prices = result.data;
    const envelope = { data: prices, nextCursor: result.nextCursor ?? null };

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Price History (${exchange}) — ${prices.length} records`);

      if (prices.length === 0) {
        prettyDim('No price data found.');
      } else {
        const preview = prices.slice(0, 20);
        const rows = preview.map((p: any) => [
          p.timestamp,
          p.markPrice ?? '—',
          p.oraclePrice ?? '—',
          p.midPrice ?? '—',
        ]);
        prettyTable(['Timestamp', 'Mark', 'Oracle', 'Mid'], rows);

        if (prices.length > 20) {
          prettyDim(`... and ${prices.length - 20} more`);
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
