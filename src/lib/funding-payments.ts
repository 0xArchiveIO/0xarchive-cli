import { ApiHttpClient, cursorPage, type CursorPage } from './http.js';

/** Venues with a wallet funding payments route. Lighter has none. */
export type FundingPaymentsExchange = 'hyperliquid' | 'hip3';

export const FUNDING_PAYMENTS_EXCHANGES: readonly FundingPaymentsExchange[] = ['hyperliquid', 'hip3'];

export interface FundingPaymentsParams {
  start: number;
  end: number;
  symbol?: string;
  dex?: string;
  cursor?: string;
  limit?: number;
}

export type FundingPaymentsResponse = CursorPage<unknown[]>;

function pathFor(exchange: FundingPaymentsExchange, address: string): string {
  const base = exchange === 'hip3' ? '/v1/hyperliquid/hip3/wallets' : '/v1/hyperliquid/wallets';
  return `${base}/${encodeURIComponent(address)}/funding`;
}

/**
 * Minimal wallet funding payments resource for the CLI until the shared SDK
 * exposes `GET /v1/hyperliquid/wallets/{address}/funding` (and the HIP-3 twin).
 * It goes through the same raw HTTP path as HIP-4 and Spot candles.
 */
export class WalletFundingClient {
  private readonly http: ApiHttpClient;

  constructor(apiKey: string, opts?: { baseUrl?: string; timeout?: number }) {
    this.http = new ApiHttpClient(apiKey, opts);
  }

  async payments(
    exchange: FundingPaymentsExchange,
    address: string,
    params: FundingPaymentsParams,
  ): Promise<FundingPaymentsResponse> {
    const envelope = await this.http.get(pathFor(exchange, address), params as unknown as Record<string, unknown>);
    return cursorPage<unknown[]>(envelope, []);
  }
}
