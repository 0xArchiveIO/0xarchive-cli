import { ApiHttpClient, cursorPage, type CursorPage } from './http.js';

const SPOT_CANDLES_PATH = '/v1/hyperliquid/spot/candles';

export interface SpotCandleHistoryParams {
  start: number;
  end: number;
  limit?: number;
  cursor?: string;
  interval?: string;
}

export type SpotCandleCursorResponse<T> = CursorPage<T>;

/**
 * Minimal Spot candle resource for the CLI until the shared SDK exposes the
 * verified `/v1/hyperliquid/spot/candles/{symbol}` route.
 */
export class SpotCandlesClient {
  private readonly http: ApiHttpClient;

  constructor(apiKey: string, opts?: { baseUrl?: string; timeout?: number }) {
    this.http = new ApiHttpClient(apiKey, opts);
  }

  async history(
    symbol: string,
    params: SpotCandleHistoryParams,
  ): Promise<SpotCandleCursorResponse<any[]>> {
    const envelope = await this.http.get(
      `${SPOT_CANDLES_PATH}/${encodeURIComponent(symbol)}`,
      params as unknown as Record<string, unknown>,
    );
    return cursorPage<any[]>(envelope, []);
  }
}
