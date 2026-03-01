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
import { parseTimestamp, parseLimit, validateInterval } from '../lib/time.js';

interface OICurrentOptions {
  exchange: string;
  symbol: string;
  apiKey?: string;
  format: string;
}

interface OIHistoryOptions {
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

export async function oiCurrentCommand(options: OICurrentOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const oi = await exchangeClient.openInterest.current(options.symbol);

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Current Open Interest (${exchange})`);
      prettyField('Open Interest', (oi as any).openInterest ?? (oi as any).oi);
      prettyField('Mark Price', (oi as any).markPrice);
      prettyField('Oracle Price', (oi as any).oraclePrice);
      prettyField('24h Volume', (oi as any).volume24h);
      prettyField('Timestamp', (oi as any).timestamp);
      process.stdout.write('\n');
    } else {
      outputJson(oi);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function oiHistoryCommand(options: OIHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  const interval = validateInterval(options.interval);

  if (!options.start || !options.end) {
    exitError(
      'Open interest history requires --start and --end.\n' +
        'Example: oxa oi history --exchange hyperliquid --symbol BTC ' +
        '--start 2026-01-01T00:00:00Z --end 2026-01-02T00:00:00Z',
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
    const result = await exchangeClient.openInterest.history(options.symbol, {
      start,
      end,
      limit,
      cursor: options.cursor,
      interval,
    });
    const records = result.data;
    const envelope = { data: records, nextCursor: result.nextCursor ?? null };

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} OI History (${exchange}) — ${records.length} records`);

      if (records.length === 0) {
        prettyDim('No open interest data found.');
      } else {
        const preview = records.slice(0, 20);
        const rows = preview.map((r: any) => [
          r.timestamp,
          r.openInterest ?? r.oi ?? '—',
          r.markPrice ?? '—',
          r.oraclePrice ?? '—',
        ]);
        prettyTable(['Timestamp', 'OI', 'Mark Price', 'Oracle Price'], rows);

        if (records.length > 20) {
          prettyDim(`... and ${records.length - 20} more`);
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
