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
  EXIT,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';

interface SummaryOptions {
  exchange: string;
  symbol: string;
  apiKey?: string;
  format: string;
}

export async function summaryCommand(options: SummaryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const summary = await exchangeClient.summary(options.symbol);

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Summary (${exchange})`);
      prettyField('Mark Price', (summary as any).markPrice);
      prettyField('Oracle Price', (summary as any).oraclePrice);
      prettyField('Mid Price', (summary as any).midPrice);
      prettyField('Funding Rate', (summary as any).fundingRate);
      prettyField('Premium', (summary as any).premium);
      prettyField('Open Interest', (summary as any).openInterest);
      prettyField('24h Volume', (summary as any).volume24h);
      if ((summary as any).liquidationVolume24h) {
        prettyField('24h Liq Volume', (summary as any).liquidationVolume24h);
      }
      if ((summary as any).longLiqVolume24h) {
        prettyField('24h Long Liq', (summary as any).longLiqVolume24h);
      }
      if ((summary as any).shortLiqVolume24h) {
        prettyField('24h Short Liq', (summary as any).shortLiqVolume24h);
      }
      prettyField('Timestamp', (summary as any).timestamp);
      process.stdout.write('\n');
    } else {
      outputJson(summary);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
