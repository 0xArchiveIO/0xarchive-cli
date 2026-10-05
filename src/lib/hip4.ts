import { ApiHttpClient, cursorPage, type CursorPage } from './http.js';

const HIP4_BASE_PATH = '/v1/hyperliquid/hip4';

// HIP-4 path encoding: the canonical form is the bare numeric `0`, `1`, `42`.
// The legacy `#0` / `%230` forms are still accepted by the API. We normalize to
// the bare form when possible (avoids URL-fragment ambiguity entirely); if the
// caller passed `#N` or `%23N` we strip the prefix and use the bare digits.
export function encodeHip4Coin(symbol: string): string {
  const trimmed = String(symbol).trim();
  // Bare numeric form is canonical: pass through as-is.
  if (/^\d+$/.test(trimmed)) return trimmed;
  // Strip leading `#` (raw or percent-encoded as %23) if present.
  const stripped = trimmed.replace(/^(#|%23)/i, '');
  if (/^\d+$/.test(stripped)) return stripped;
  // Unknown shape: fall back to URL-encoding the original string.
  return encodeURIComponent(trimmed);
}

/** One page of a HIP-4 cursor-paged route. */
export type CursorResponse<T> = CursorPage<T>;

/** A trade side filter, applied by the API. */
export type TradeSideParam = 'buy' | 'sell';

export class Hip4Client {
  private readonly http: ApiHttpClient;

  constructor(apiKey: string, opts?: { baseUrl?: string; timeout?: number }) {
    this.http = new ApiHttpClient(apiKey, opts);
  }

  private async cursorRequest<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<CursorResponse<T>> {
    return cursorPage<T>(await this.http.get(path, params), [] as unknown as T);
  }

  // Some endpoints return the bare object/array under `data`; others return it raw.
  private async unwrap<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const envelope = (await this.http.get(path, params)) as { data?: T } | null;
    if (envelope && typeof envelope === 'object' && 'data' in envelope && envelope.data !== undefined) {
      return envelope.data as T;
    }
    return envelope as unknown as T;
  }

  // ── Outcomes (HIP-4 specific) ─────────────────────────────────────────
  outcomes = {
    list: async (params?: { isSettled?: boolean | 'all'; limit?: number; cursor?: string }): Promise<CursorResponse<unknown[]>> => {
      const q: Record<string, unknown> = {};
      if (params?.isSettled !== undefined && params.isSettled !== 'all') {
        q.is_settled = params.isSettled;
      }
      if (params?.limit !== undefined) q.limit = params.limit;
      if (params?.cursor) q.cursor = params.cursor;
      return this.cursorRequest<unknown[]>(`${HIP4_BASE_PATH}/outcomes`, q);
    },
    get: async (outcomeId: number | string): Promise<unknown> => {
      return this.unwrap<unknown>(`${HIP4_BASE_PATH}/outcomes/${encodeURIComponent(String(outcomeId))}`);
    },
  };

  // ── Instruments ───────────────────────────────────────────────────────
  instruments = {
    list: async (): Promise<unknown[]> => {
      return this.unwrap<unknown[]>(`${HIP4_BASE_PATH}/instruments`);
    },
    get: async (symbol: string): Promise<unknown> => {
      return this.unwrap<unknown>(`${HIP4_BASE_PATH}/instruments/${encodeHip4Coin(symbol)}`);
    },
  };

  // ── Orderbook ─────────────────────────────────────────────────────────
  orderbook = {
    get: async (
      symbol: string,
      params?: { depth?: number; timestamp?: number },
    ): Promise<any> => {
      return this.unwrap<any>(
        `${HIP4_BASE_PATH}/orderbook/${encodeHip4Coin(symbol)}`,
        params as Record<string, unknown>,
      );
    },
    history: async (
      symbol: string,
      params: { start: number; end: number; depth?: number; limit?: number; cursor?: string },
    ): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/orderbook/${encodeHip4Coin(symbol)}/history`,
        params as Record<string, unknown>,
      );
    },
  };

  // ── Trades ────────────────────────────────────────────────────────────
  trades = {
    list: async (
      symbol: string,
      params: { start: number; end: number; limit?: number; cursor?: string; side?: TradeSideParam },
    ): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/trades/${encodeHip4Coin(symbol)}`,
        params as Record<string, unknown>,
      );
    },
    recent: async (
      symbol: string,
      limitOrParams?: number | { limit?: number; side?: TradeSideParam },
    ): Promise<any[]> => {
      const params = typeof limitOrParams === 'number' ? { limit: limitOrParams } : (limitOrParams ?? {});
      const q: Record<string, unknown> = {};
      if (params.limit) q.limit = params.limit;
      if (params.side) q.side = params.side;
      return this.unwrap<any[]>(`${HIP4_BASE_PATH}/trades/${encodeHip4Coin(symbol)}/recent`, q);
    },
  };

  // ── Candles ───────────────────────────────────────────────────────────
  candles = {
    history: async (
      symbol: string,
      params: {
        start: number;
        end: number;
        limit?: number;
        cursor?: string;
        interval?: string;
      },
    ): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/candles/${encodeHip4Coin(symbol)}`,
        params as Record<string, unknown>,
      );
    },
  };

  // ── Open interest ─────────────────────────────────────────────────────
  openInterest = {
    current: async (symbol: string): Promise<any> => {
      return this.unwrap<any>(`${HIP4_BASE_PATH}/openinterest/${encodeHip4Coin(symbol)}/current`);
    },
    history: async (
      symbol: string,
      params: { start: number; end: number; limit?: number; cursor?: string; interval?: string },
    ): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/openinterest/${encodeHip4Coin(symbol)}`,
        params as Record<string, unknown>,
      );
    },
  };

  // ── Per-symbol summary / freshness / prices ──────────────────────────
  async summary(symbol: string): Promise<any> {
    return this.unwrap<any>(`${HIP4_BASE_PATH}/summary/${encodeHip4Coin(symbol)}`);
  }

  async freshness(symbol: string): Promise<any> {
    return this.unwrap<any>(`${HIP4_BASE_PATH}/freshness/${encodeHip4Coin(symbol)}`);
  }

  async priceHistory(
    symbol: string,
    params: { start: number; end: number; limit?: number; cursor?: string; interval?: string },
  ): Promise<CursorResponse<any[]>> {
    return this.cursorRequest<any[]>(
      `${HIP4_BASE_PATH}/prices/${encodeHip4Coin(symbol)}`,
      params as Record<string, unknown>,
    );
  }

  // ── Orders ────────────────────────────────────────────────────────────
  orders = {
    history: async (symbol: string, params: Record<string, unknown>): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/orders/${encodeHip4Coin(symbol)}/history`,
        params,
      );
    },
    flow: async (symbol: string, params: Record<string, unknown>): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/orders/${encodeHip4Coin(symbol)}/flow`,
        params,
      );
    },
    tpsl: async (symbol: string, params: Record<string, unknown>): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/orders/${encodeHip4Coin(symbol)}/tpsl`,
        params,
      );
    },
  };

  // ── L4 ────────────────────────────────────────────────────────────────
  l4Orderbook = {
    get: async (symbol: string, params?: Record<string, unknown>): Promise<any> => {
      return this.unwrap<any>(
        `${HIP4_BASE_PATH}/orderbook/${encodeHip4Coin(symbol)}/l4`,
        params,
      );
    },
    diffs: async (symbol: string, params: Record<string, unknown>): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/orderbook/${encodeHip4Coin(symbol)}/l4/diffs`,
        params,
      );
    },
    history: async (symbol: string, params: Record<string, unknown>): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/orderbook/${encodeHip4Coin(symbol)}/l4/history`,
        params,
      );
    },
  };
}
