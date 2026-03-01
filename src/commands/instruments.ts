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
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';

interface InstrumentsOptions {
  exchange: string;
  apiKey?: string;
  format: string;
}

export async function instrumentsCommand(options: InstrumentsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const instruments = await exchangeClient.instruments.list();

    if (format === 'pretty') {
      prettyHeader(`Instruments (${exchange}) — ${instruments.length} total`);

      if (instruments.length === 0) {
        prettyDim('No instruments found.');
      } else if (exchange === 'lighter') {
        const rows = instruments.map((i: any) => [
          i.symbol ?? i.name ?? '—',
          i.marketType ?? '—',
          i.status ?? (i.isActive ? 'active' : 'inactive'),
          i.takerFee != null ? String(i.takerFee) : '—',
          i.makerFee != null ? String(i.makerFee) : '—',
        ]);
        prettyTable(['Symbol', 'Type', 'Status', 'Taker Fee', 'Maker Fee'], rows);
      } else if (exchange === 'hip3') {
        const rows = instruments.map((i: any) => [
          i.coin ?? '—',
          i.namespace ?? '—',
          i.ticker ?? '—',
          i.markPrice ?? '—',
          i.openInterest ?? '—',
        ]);
        prettyTable(['Coin', 'Namespace', 'Ticker', 'Mark Price', 'OI'], rows);
      } else {
        // Hyperliquid
        const rows = instruments.map((i: any) => [
          i.name ?? '—',
          i.instrumentType ?? 'perp',
          i.isActive ? 'active' : 'inactive',
          i.maxLeverage != null ? String(i.maxLeverage) : '—',
          i.szDecimals != null ? String(i.szDecimals) : '—',
        ]);
        prettyTable(['Symbol', 'Type', 'Status', 'Max Leverage', 'Size Decimals'], rows);
      }
      process.stdout.write('\n');
    } else {
      outputJson(instruments);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
