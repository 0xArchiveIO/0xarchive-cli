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

interface FundingCurrentOptions {
  exchange: string;
  symbol: string;
  apiKey?: string;
  format: string;
}

interface FundingHistoryOptions {
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

export async function fundingCurrentCommand(options: FundingCurrentOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const rate = await exchangeClient.funding.current(options.symbol);

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Current Funding Rate (${exchange})`);
      prettyField('Rate', (rate as any).fundingRate ?? (rate as any).rate);
      prettyField('Premium', (rate as any).premium);
      prettyField('Timestamp', (rate as any).timestamp);
      process.stdout.write('\n');
    } else {
      outputJson(rate);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function fundingHistoryCommand(options: FundingHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  const interval = validateInterval(options.interval);

  if (!options.start || !options.end) {
    exitError(
      'Funding history requires --start and --end.\n' +
        'Example: oxa funding history --exchange hyperliquid --symbol BTC ' +
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
    const result = await exchangeClient.funding.history(options.symbol, {
      start,
      end,
      limit,
      cursor: options.cursor,
      interval,
    });
    const rates = result.data;
    const envelope = { data: rates, nextCursor: result.nextCursor ?? null };

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Funding History (${exchange}) — ${rates.length} records`);

      if (rates.length === 0) {
        prettyDim('No funding rates found.');
      } else {
        const preview = rates.slice(0, 20);
        const rows = preview.map((r: any) => [
          r.timestamp,
          r.fundingRate ?? r.rate ?? '—',
          r.premium ?? '—',
        ]);
        prettyTable(['Timestamp', 'Rate', 'Premium'], rows);

        if (rates.length > 20) {
          prettyDim(`... and ${rates.length - 20} more`);
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
