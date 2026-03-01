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

interface OrderbookGetOptions {
  exchange: string;
  symbol: string;
  depth?: string;
  timestamp?: string;
  apiKey?: string;
  format: string;
}

export async function orderbookGetCommand(options: OrderbookGetOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);

  // Validate depth
  let depth: number | undefined;
  if (options.depth !== undefined) {
    depth = parseInt(options.depth, 10);
    if (!Number.isInteger(depth) || depth <= 0) {
      exitError('--depth must be a positive integer', EXIT.VALIDATION);
    }
  }

  // Validate timestamp
  let timestamp: number | undefined;
  if (options.timestamp !== undefined) {
    timestamp = parseInt(options.timestamp, 10);
    if (!Number.isInteger(timestamp) || timestamp <= 0) {
      exitError('--timestamp must be a positive integer (Unix ms)', EXIT.VALIDATION);
    }
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const orderbook = await exchangeClient.orderbook.get(options.symbol, {
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
          .map((l) => [l.px, l.sz, String(l.n)]);
        prettyTable(['Price', 'Size', 'Orders'], askRows);
      }

      if (orderbook.bids.length > 0) {
        process.stdout.write('\n');
        prettyDim(`Bids (${orderbook.bids.length} levels)`);
        const bidRows = orderbook.bids.slice(0, 10).map((l) => [l.px, l.sz, String(l.n)]);
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
