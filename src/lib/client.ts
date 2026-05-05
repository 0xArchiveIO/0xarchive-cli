import { OxArchive } from '@0xarchive/sdk';
import type { HyperliquidClient, LighterClient, Hip3Client } from '@0xarchive/sdk';
import { Hip4Client } from './hip4.js';
import { exitError, EXIT } from './output.js';

export type Exchange = 'hyperliquid' | 'lighter' | 'hip3' | 'hip4';

const VALID_EXCHANGES: Exchange[] = ['hyperliquid', 'lighter', 'hip3', 'hip4'];

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

// HIP-4 has no funding/liquidations/candles by design (binary outcome markets).
// Reject early with a clear message before any network call.
export function rejectHip4(
  exchange: Exchange,
  feature: string,
): asserts exchange is Exclude<Exchange, 'hip4'> {
  if (exchange === 'hip4') {
    exitError(
      `HIP-4 has no ${feature} endpoint. Use --exchange hl or hip3.`,
      EXIT.VALIDATION,
    );
  }
}

export function createClient(apiKey: string): OxArchive {
  return new OxArchive({ apiKey });
}

export function createHip4Client(apiKey: string): Hip4Client {
  return new Hip4Client(apiKey);
}

export function getExchangeClient(
  client: OxArchive,
  exchange: 'hyperliquid',
  apiKey?: string,
): HyperliquidClient;
export function getExchangeClient(
  client: OxArchive,
  exchange: 'lighter',
  apiKey?: string,
): LighterClient;
export function getExchangeClient(
  client: OxArchive,
  exchange: 'hip3',
  apiKey?: string,
): Hip3Client;
export function getExchangeClient(
  client: OxArchive,
  exchange: 'hip4',
  apiKey?: string,
): Hip4Client;
export function getExchangeClient(
  client: OxArchive,
  exchange: Exclude<Exchange, 'hip4'>,
  apiKey?: string,
): HyperliquidClient | LighterClient | Hip3Client;
export function getExchangeClient(
  client: OxArchive,
  exchange: Exchange,
  apiKey?: string,
): HyperliquidClient | LighterClient | Hip3Client | Hip4Client;
export function getExchangeClient(
  client: OxArchive,
  exchange: Exchange,
  apiKey?: string,
): HyperliquidClient | LighterClient | Hip3Client | Hip4Client {
  if (exchange === 'hip4') return new Hip4Client(apiKey ?? '');
  if (exchange === 'hip3') return client.hyperliquid.hip3;
  if (exchange === 'hyperliquid') return client.hyperliquid;
  return client.lighter;
}
