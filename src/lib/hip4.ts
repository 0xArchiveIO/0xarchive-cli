import { OxArchiveError } from '@0xarchive/sdk';

const DEFAULT_BASE_URL = 'https://api.0xarchive.io';
const DEFAULT_TIMEOUT = 30_000;
const HIP4_BASE_PATH = '/v1/hyperliquid/hip4';

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function transformKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(transformKeys);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = transformKeys(value);
    }
    return result;
  }
  return obj;
}

// HIP-4 path encoding: the canonical form is the bare numeric `0`, `1`, `42`.
// The legacy `#0` / `%230` forms are still accepted by the API. We normalize to
// the bare form when possible (avoids URL-fragment ambiguity entirely); if the
// caller passed `#N` or `%23N` we strip the prefix and use the bare digits.
export function encodeHip4Coin(symbol: string): string {
  const trimmed = String(symbol).trim();
  // Bare numeric form is canonical — pass through as-is.
  if (/^\d+$/.test(trimmed)) return trimmed;
  // Strip leading `#` (raw or percent-encoded as %23) if present.
  const stripped = trimmed.replace(/^(#|%23)/i, '');
  if (/^\d+$/.test(stripped)) return stripped;
  // Unknown shape — fall back to URL-encoding the original string.
  return encodeURIComponent(trimmed);
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  meta?: { nextCursor?: string; count?: number; requestId?: string };
  error?: string;
}

export interface CursorResponse<T> {
  data: T;
  nextCursor?: string;
}

export class Hip4Client {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(apiKey: string, opts?: { baseUrl?: string; timeout?: number }) {
    this.apiKey = apiKey;
    this.baseUrl = (opts?.baseUrl ?? process.env.OXA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
  }

  private async request<T = unknown>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const rawData = await response.json();
      const data = transformKeys(rawData) as ApiEnvelope<T> & T;

      if (!response.ok) {
        throw new OxArchiveError(
          (data as ApiEnvelope<T>).error || `Request failed with status ${response.status}`,
          response.status,
          (data as ApiEnvelope<T>).meta?.requestId,
        );
      }
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof OxArchiveError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OxArchiveError(`Request timeout after ${this.timeout}ms`, 408);
      }
      throw new OxArchiveError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
      );
    }
  }

  private async cursorRequest<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<CursorResponse<T>> {
    const envelope = await this.request<ApiEnvelope<T>>(path, params);
    if (envelope && typeof envelope === 'object' && 'data' in envelope) {
      return {
        data: (envelope.data as T) ?? ([] as unknown as T),
        nextCursor: envelope.meta?.nextCursor,
      };
    }
    // Fallback: API returned a bare array
    return { data: envelope as unknown as T };
  }

  // Some endpoints return the bare object/array under `data`; others return it raw.
  private async unwrap<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const envelope = await this.request<ApiEnvelope<T>>(path, params);
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
      params: { start: number; end: number; limit?: number; cursor?: string },
    ): Promise<CursorResponse<any[]>> => {
      return this.cursorRequest<any[]>(
        `${HIP4_BASE_PATH}/trades/${encodeHip4Coin(symbol)}`,
        params as Record<string, unknown>,
      );
    },
    recent: async (symbol: string, limit?: number): Promise<any[]> => {
      const q: Record<string, unknown> = {};
      if (limit) q.limit = limit;
      return this.unwrap<any[]>(`${HIP4_BASE_PATH}/trades/${encodeHip4Coin(symbol)}/recent`, q);
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
