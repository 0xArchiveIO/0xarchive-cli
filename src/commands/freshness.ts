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
  EXIT,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';

interface FreshnessOptions {
  exchange: string;
  symbol: string;
  apiKey?: string;
  format: string;
}

function formatLag(lagMs: number | undefined | null): string {
  if (lagMs === undefined || lagMs === null) return '—';
  if (lagMs < 1000) return `${lagMs}ms`;
  if (lagMs < 60_000) return `${(lagMs / 1000).toFixed(1)}s`;
  if (lagMs < 3_600_000) return `${(lagMs / 60_000).toFixed(1)}m`;
  return `${(lagMs / 3_600_000).toFixed(1)}h`;
}

export async function freshnessCommand(options: FreshnessOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const freshness = await exchangeClient.freshness(options.symbol);

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Freshness (${exchange})`);
      prettyField('Measured at', freshness.measuredAt);
      process.stdout.write('\n');

      const dataTypes: Array<{ name: string; info: { lastUpdated?: string; lagMs?: number } | undefined }> = [
        { name: 'orderbook', info: freshness.orderbook },
        { name: 'trades', info: freshness.trades },
        { name: 'funding', info: freshness.funding },
        { name: 'open_interest', info: freshness.openInterest },
      ];

      // Include liquidations if present (Hyperliquid only)
      if (freshness.liquidations) {
        dataTypes.push({ name: 'liquidations', info: freshness.liquidations });
      }

      const rows = dataTypes.map((dt) => [
        dt.name,
        dt.info?.lastUpdated ?? '—',
        formatLag(dt.info?.lagMs),
      ]);

      prettyTable(['Data Type', 'Last Updated', 'Lag'], rows);
      process.stdout.write('\n');
    } else {
      outputJson(freshness);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
