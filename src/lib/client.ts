import { OxArchive } from '@0xarchive/sdk';
import type { HyperliquidClient, LighterClient, Hip3Client } from '@0xarchive/sdk';
import { exitError, EXIT } from './output.js';

export type Exchange = 'hyperliquid' | 'lighter' | 'hip3';

const VALID_EXCHANGES: Exchange[] = ['hyperliquid', 'lighter', 'hip3'];

export function resolveApiKey(cliKey?: string): string {
  const key = cliKey || process.env.OXA_API_KEY;
  if (!key) {
    exitError(
      'API key required. Pass --api-key or set OXA_API_KEY environment variable. ' +
        'Get a key at https://0xarchive.io',
      EXIT.AUTH,
    );
  }
  return key;
}

export function validateExchange(exchange: string): Exchange {
  if (!VALID_EXCHANGES.includes(exchange as Exchange)) {
    exitError(
      `Invalid exchange "${exchange}". Must be one of: ${VALID_EXCHANGES.join(', ')}`,
      EXIT.VALIDATION,
    );
  }
  return exchange as Exchange;
}

export function createClient(apiKey: string): OxArchive {
  return new OxArchive({ apiKey });
}

export function getExchangeClient(
  client: OxArchive,
  exchange: Exchange,
): HyperliquidClient | LighterClient | Hip3Client {
  if (exchange === 'hip3') return client.hyperliquid.hip3;
  return client[exchange];
}
