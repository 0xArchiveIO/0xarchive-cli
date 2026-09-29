import {
  resolveApiKey,
  validateVenue,
  createClient,
  getExchangeClient,
  type Venue,
} from '../lib/client.js';
import type { OxArchive } from '@0xarchive/sdk';
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
import { pageEnvelope, printNextPage } from '../lib/emit.js';
import { writeOutputFile } from '../lib/file.js';
import { parsePositiveInt, parseTimestamp, parseLimit } from '../lib/time.js';

interface OrderbookGetOptions {
  exchange: string;
  symbol: string;
  depth?: string;
  timestamp?: string;
  apiKey?: string;
  format: string;
}

interface OrderbookHistoryOptions {
  exchange: string;
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

/** The order book resource the commands call, on every venue client. */
interface OrderbookResource {
  get(symbol: string, params: { depth?: number; timestamp?: number }): Promise<any>;
  history(
    symbol: string,
    params: { start: number; end: number; depth?: number; limit?: number; cursor?: string },
  ): Promise<{ data: any[]; nextCursor?: string; hasMore?: boolean }>;
}

function orderbookResource(client: OxArchive, exchange: Venue, apiKey: string): OrderbookResource {
  if (exchange === 'spot') return client.spot.orderbook as unknown as OrderbookResource;
  return getExchangeClient(client, exchange, apiKey).orderbook as unknown as OrderbookResource;
}

export async function orderbookGetCommand(options: OrderbookGetOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateVenue(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const depth = parsePositiveInt(options.depth, 'depth');
  const timestamp = parsePositiveInt(options.timestamp, 'timestamp');

  const client = createClient(apiKey);

  try {
    const orderbook = await orderbookResource(client, exchange, apiKey).get(options.symbol, {
      depth,
      timestamp,
    });

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Orderbook (${exchange})`);
      prettyField('Timestamp', orderbook.timestamp);
      prettyField('Mid Price', orderbook.midPrice);
      prettyField('Spread', orderbook.spread);
      prettyField('Spread (bps)', orderbook.spreadBps);

      if (orderbook.asks.length > 0) {
        process.stdout.write('\n');
        prettyDim(`Asks (${orderbook.asks.length} levels)`);
        const askRows = orderbook.asks
          .slice(0, 10)
          .reverse()
          .map((l: any) => [l.px, l.sz, String(l.n)]);
        prettyTable(['Price', 'Size', 'Orders'], askRows);
      }

      if (orderbook.bids.length > 0) {
        process.stdout.write('\n');
        prettyDim(`Bids (${orderbook.bids.length} levels)`);
        const bidRows = orderbook.bids.slice(0, 10).map((l: any) => [l.px, l.sz, String(l.n)]);
        prettyTable(['Price', 'Size', 'Orders'], bidRows);
      }
      process.stdout.write('\n');
    } else {
      outputJson(orderbook);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function orderbookHistoryCommand(options: OrderbookHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateVenue(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const depth = parsePositiveInt(options.depth, 'depth');
  const limit = parseLimit(options.limit);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const result = await orderbookResource(client, exchange, apiKey).history(options.symbol, {
      start,
      end,
      depth,
      limit,
      cursor: options.cursor,
    });
    const snapshots = result.data;
    const envelope = pageEnvelope(result, snapshots);

    if (options.out) {
      writeOutputFile(options.out, envelope);
    }

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Orderbook History (${exchange}) — ${snapshots.length} snapshots`);

      if (snapshots.length === 0) {
        prettyDim('No snapshots found.');
      } else {
        const preview = snapshots.slice(0, 20);
        const rows = preview.map((ob: any) => [
          ob.timestamp,
          ob.midPrice ?? '—',
          ob.spreadBps ?? '—',
          String(ob.bids?.length ?? 0),
          String(ob.asks?.length ?? 0),
        ]);
        prettyTable(['Timestamp', 'Mid Price', 'Spread (bps)', 'Bid Levels', 'Ask Levels'], rows);

        if (snapshots.length > 20) {
          prettyDim(`... and ${snapshots.length - 20} more`);
        }
        printNextPage(result);
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
