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
import { writeOutputFile } from '../lib/file.js';
import { parseTimestamp, parseLimit } from '../lib/time.js';

interface LiquidationsOptions {
  exchange: string;
  symbol: string;
  start?: string;
  end?: string;
  limit?: string;
  cursor?: string;
  apiKey?: string;
  format: string;
}

interface LiquidationsVolumeOptions {
  exchange: string;
  symbol: string;
  start: string;
  end: string;
  interval?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

interface LiquidationsUserOptions {
  exchange: string;
  user: string;
  start: string;
  end: string;
  coin?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

const LIQUIDATION_EXCHANGES = ['hyperliquid', 'hip3'];

function validateLiquidationExchange(exchange: string): string {
  if (!LIQUIDATION_EXCHANGES.includes(exchange)) {
    exitError(
      `Liquidations are only available for hyperliquid and hip3. Got "${exchange}".`,
      EXIT.VALIDATION,
    );
  }
  return exchange;
}

export async function liquidationsCommand(options: LiquidationsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  validateLiquidationExchange(exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);

  if (!options.start || !options.end) {
    exitError(
      'Liquidations require --start and --end.\n' +
        'Example: oxa liquidations history --exchange hyperliquid --symbol BTC ' +
        '--start 2026-01-01T00:00:00Z --end 2026-01-01T01:00:00Z',
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
    const hlClient = exchangeClient as any;
    const result = await hlClient.liquidations.history(options.symbol, {
      start,
      end,
      limit,
      cursor: options.cursor,
    });
    const liqs = result.data;
    const envelope = { data: liqs, nextCursor: result.nextCursor ?? null };

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Liquidations (${exchange}) — ${liqs.length} records`);

      if (liqs.length === 0) {
        prettyDim('No liquidations found.');
      } else {
        const preview = liqs.slice(0, 20);
        const rows = preview.map((l: any) => [
          l.timestamp,
          l.side === 'B' ? 'LONG' : 'SHORT',
          l.price,
          l.size,
          l.liquidatedUser?.slice(0, 10) + '...' || '—',
        ]);
        prettyTable(['Timestamp', 'Side', 'Price', 'Size', 'User'], rows);

        if (liqs.length > 20) {
          prettyDim(`... and ${liqs.length - 20} more`);
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

export async function liquidationsVolumeCommand(options: LiquidationsVolumeOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  validateLiquidationExchange(exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const hlClient = exchangeClient as any;
    const result = await hlClient.liquidations.volume(options.symbol, {
      start,
      end,
      interval: options.interval,
      limit,
      cursor: options.cursor,
    });
    const buckets = result.data;
    const envelope = { data: buckets, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
    }

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Liquidation Volume (${exchange}) — ${buckets.length} buckets`);

      if (buckets.length === 0) {
        prettyDim('No volume data found.');
      } else {
        const preview = buckets.slice(0, 20);
        const rows = preview.map((b: any) => [
          b.timestamp,
          `$${b.totalUsd}`,
          `$${b.longUsd}`,
          `$${b.shortUsd}`,
        ]);
        prettyTable(['Timestamp', 'Total USD', 'Long USD', 'Short USD'], rows);

        if (buckets.length > 20) {
          prettyDim(`... and ${buckets.length - 20} more`);
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

export async function liquidationsUserCommand(options: LiquidationsUserOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  validateLiquidationExchange(exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  if (exchange !== 'hyperliquid') {
    exitError(
      'Liquidations by user is currently only available for hyperliquid.',
      EXIT.VALIDATION,
    );
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const hlClient = exchangeClient as any;
    const result = await hlClient.liquidations.byUser(options.user, {
      start,
      end,
      coin: options.coin,
      limit,
      cursor: options.cursor,
    });
    const liqs = result.data;
    const envelope = { data: liqs, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
    }

    if (format === 'pretty') {
      prettyHeader(`Liquidations for ${options.user.slice(0, 10)}... (${exchange}) — ${liqs.length} records`);

      if (liqs.length === 0) {
        prettyDim('No liquidations found for this user.');
      } else {
        const preview = liqs.slice(0, 20);
        const rows = preview.map((l: any) => [
          l.timestamp,
          l.coin ?? '—',
          l.side === 'B' ? 'LONG' : 'SHORT',
          l.price,
          l.size,
        ]);
        prettyTable(['Timestamp', 'Coin', 'Side', 'Price', 'Size'], rows);

        if (liqs.length > 20) {
          prettyDim(`... and ${liqs.length - 20} more`);
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
