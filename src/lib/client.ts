import { OxArchive } from '@0xarchive/sdk';
import type { HyperliquidClient, LighterClient, Hip3Client } from '@0xarchive/sdk';
import { Hip4Client } from './hip4.js';
import { exitError, EXIT } from './output.js';

/**
 * `--exchange` values. `lighter` and `rh-lighter` are the two deployments of
 * Lighter: mainnet and Robinhood Chain.
 */
export type Exchange = 'hyperliquid' | 'lighter' | 'rh-lighter' | 'hip3' | 'hip4';

export const VALID_EXCHANGES: readonly Exchange[] = ['hyperliquid', 'lighter', 'rh-lighter', 'hip3', 'hip4'];

/**
 * `--exchange` values on the shared-datatype commands that also serve
 * Hyperliquid Spot (`--exchange spot`): order book, trades, candles, L4, order
 * history, freshness, and instruments.
 */
export type Venue = Exchange | 'spot';

export const VALID_VENUES: readonly Venue[] = ['hyperliquid', 'hip3', 'hip4', 'spot', 'lighter', 'rh-lighter'];

/** Both Lighter deployments. */
export type LighterExchange = 'lighter' | 'rh-lighter';

export function isLighterExchange(exchange: string): exchange is LighterExchange {
  return exchange === 'lighter' || exchange === 'rh-lighter';
}

/** "a", "a or b", "a, b, or c". */
export function listOr(values: readonly string[]): string {
  if (values.length <= 1) return values.join('');
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, or ${values[values.length - 1]}`;
}

/** Human label for an `--exchange` value, used in headers and error messages. */
export function exchangeLabel(exchange: string): string {
  switch (exchange) {
    case 'hyperliquid':
      return 'Hyperliquid';
    case 'hip3':
      return 'Hyperliquid HIP-3';
    case 'hip4':
      return 'Hyperliquid HIP-4';
    case 'lighter':
      return 'Lighter';
    case 'rh-lighter':
      return 'Lighter on Robinhood Chain';
    case 'spot':
      return 'Hyperliquid Spot';
    default:
      return exchange;
  }
}

// The oldest @0xarchive/sdk release with the Robinhood Chain client, the
// positions resources, Lighter liquidations, and the `mempool` channel.
// package.json pins it as the floor; this message covers a stale install that
// predates the floor.
export const SDK_FLOOR = '1.13.0';

export function sdkTooOld(feature: string): never {
  exitError(
    `Support for ${feature} requires @0xarchive/sdk ${SDK_FLOOR} or newer. Reinstall @0xarchive/cli to pick it up.`,
    EXIT.INTERNAL,
  );
}

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
  if (exchange === 'spot') {
    exitError(
      `Hyperliquid Spot (--exchange spot) is not served by this command. Must be one of: ${VALID_EXCHANGES.join(', ')}. ` +
        'Run "oxa spot --help" for the Spot commands.',
      EXIT.VALIDATION,
    );
  }
  if (!VALID_EXCHANGES.includes(exchange as Exchange)) {
    exitError(
      `Invalid exchange "${exchange}". Must be one of: ${VALID_EXCHANGES.join(', ')}`,
      EXIT.VALIDATION,
    );
  }
  return exchange as Exchange;
}

/** Validate `--exchange` on a command that also serves Hyperliquid Spot. */
export function validateVenue(exchange: string): Venue {
  if (!VALID_VENUES.includes(exchange as Venue)) {
    exitError(
      `Invalid exchange "${exchange}". Must be one of: ${VALID_VENUES.join(', ')}`,
      EXIT.VALIDATION,
    );
  }
  return exchange as Venue;
}

/**
 * Reject an `--exchange` value that has no endpoint for `feature`, before any
 * network call. `alsoServedBy` names further `--exchange` values the command
 * accepts (such as `spot`), for the message.
 */
export function requireExchange<T extends Exchange>(
  exchange: Exchange,
  allowed: readonly T[],
  feature: string,
  alsoServedBy: readonly string[] = [],
): asserts exchange is T {
  if (!allowed.includes(exchange as T)) {
    exitError(
      `${exchangeLabel(exchange)} has no ${feature} endpoint. Use --exchange ${listOr([...allowed, ...alsoServedBy])}.`,
      EXIT.VALIDATION,
    );
  }
}

// HIP-4 has no funding or liquidation endpoints (binary outcome markets).
// Reject unsupported requests early with a clear message before any network call.
export function rejectHip4(
  exchange: Exchange,
  feature: string,
): asserts exchange is Exclude<Exchange, 'hip4'> {
  if (exchange === 'hip4') {
    exitError(
      `HIP-4 has no ${feature} endpoint. Use --exchange hyperliquid, hip3, lighter, or rh-lighter.`,
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

/**
 * The Lighter on Robinhood Chain client (`client.rhLighter`). It has the same
 * resources as the mainnet Lighter client except L3.
 */
export function getRhLighterClient(client: OxArchive): LighterClient {
  const rh = (client as unknown as { rhLighter?: LighterClient }).rhLighter;
  if (!rh) sdkTooOld('Lighter on Robinhood Chain (--exchange rh-lighter)');
  return rh;
}

export function getExchangeClient(
  client: OxArchive,
  exchange: 'hyperliquid',
  apiKey?: string,
): HyperliquidClient;
export function getExchangeClient(
  client: OxArchive,
  exchange: LighterExchange,
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
  if (exchange === 'rh-lighter') return getRhLighterClient(client);
  return client.lighter;
}
