import {
  resolveApiKey,
  validateExchange,
  createClient,
  getExchangeClient,
} from '../lib/client.js';
import {
  outputJson,
  validateFormat,
  prettySuccess,
  prettyField,
  EXIT,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';

interface AuthTestOptions {
  apiKey?: string;
  exchange: string;
  symbol: string;
  format: string;
}

export async function authTestCommand(options: AuthTestOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    await exchangeClient.freshness(options.symbol);

    const result = {
      ok: true,
      command: 'auth test',
      exchange,
      symbol: options.symbol,
      checked_at: new Date().toISOString(),
    };

    if (format === 'pretty') {
      prettySuccess('API key is valid');
      prettyField('Exchange', exchange);
      prettyField('Symbol', options.symbol);
      prettyField('Checked at', result.checked_at);
      process.stdout.write('\n');
    } else {
      outputJson(result);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
