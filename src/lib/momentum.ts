import { ApiHttpClient, cursorPage, type CursorPage } from './http.js';

/** The momentum lookbacks the API serves. `--lookback` is required: there is no default. */
export const MOMENTUM_LOOKBACKS = ['7d', '14d'] as const;

/** The factor's universes: the top 25 or top 50 perps by 30-day dollar volume. */
export const MOMENTUM_UNIVERSES = ['top25', 'top50'] as const;

/** The returns route's bucket widths, on UTC boundaries. */
export const MOMENTUM_INTERVALS = ['1h', '1d'] as const;

export type MomentumLookback = (typeof MOMENTUM_LOOKBACKS)[number];
export type MomentumUniverse = (typeof MOMENTUM_UNIVERSES)[number];
export type MomentumInterval = (typeof MOMENTUM_INTERVALS)[number];

export interface MomentumScoresParams {
  lookback: MomentumLookback;
  at?: number;
}

export interface MomentumReturnsParams {
  lookback: MomentumLookback;
  universe?: MomentumUniverse;
  start?: number;
  end?: number;
  interval?: MomentumInterval;
  cursor?: string;
  limit?: number;
  holdings?: boolean;
}

const BASE = '/v1/hyperliquid/factors/momentum';

/**
 * The momentum factor on Hyperliquid perps (`GET /v1/hyperliquid/factors/momentum`,
 * `/current` and `/returns`) until the shared SDK exposes it. It goes through
 * the same raw HTTP path as HIP-4, Spot candles and wallet funding payments.
 */
export class MomentumClient {
  private readonly http: ApiHttpClient;

  constructor(apiKey: string, opts?: { baseUrl?: string; timeout?: number }) {
    this.http = new ApiHttpClient(apiKey, opts);
  }

  /** Every eligible perp's reading as of the close of the hour at or before `at` (default now), strongest first. */
  async get(params: MomentumScoresParams): Promise<CursorPage<unknown[]>> {
    return cursorPage<unknown[]>(await this.http.get(BASE, params as unknown as Record<string, unknown>), []);
  }

  /** The newest reading. */
  async current(params: { lookback: MomentumLookback }): Promise<CursorPage<unknown[]>> {
    return cursorPage<unknown[]>(await this.http.get(`${BASE}/current`, params), []);
  }

  /** The long-short factor's return per bucket, oldest first, cursor-paged. */
  async returns(params: MomentumReturnsParams): Promise<CursorPage<unknown[]>> {
    return cursorPage<unknown[]>(
      await this.http.get(`${BASE}/returns`, params as unknown as Record<string, unknown>),
      [],
    );
  }
}
