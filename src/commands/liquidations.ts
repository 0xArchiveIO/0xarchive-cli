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

export async function liquidationsCommand(options: LiquidationsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);

  if (exchange !== 'hyperliquid') {
    exitError(
      'Liquidations are only available for hyperliquid.',
      EXIT.VALIDATION,
    );
  }

  if (!options.start || !options.end) {
    exitError(
      'Liquidations require --start and --end.\n' +
        'Example: oxa liquidations --exchange hyperliquid --symbol BTC ' +
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
    // Liquidations only exist on HyperliquidClient
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
