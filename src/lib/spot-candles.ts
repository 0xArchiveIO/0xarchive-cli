import { OxArchiveError } from '@0xarchive/sdk';

const DEFAULT_BASE_URL = 'https://api.0xarchive.io';
const DEFAULT_TIMEOUT = 30_000;
const SPOT_CANDLES_PATH = '/v1/hyperliquid/spot/candles';

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

interface ApiEnvelope<T> {
  data?: T;
  meta?: { nextCursor?: string; requestId?: string };
  error?: string;
}

export interface SpotCandleHistoryParams {
  start: number;
  end: number;
  limit?: number;
  cursor?: string;
  interval?: string;
}

export interface SpotCandleCursorResponse<T> {
  data: T;
  nextCursor?: string;
}

/**
 * Minimal Spot candle resource for the CLI until the shared SDK exposes the
 * verified `/v1/hyperliquid/spot/candles/{symbol}` route.
 */
export class SpotCandlesClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(apiKey: string, opts?: { baseUrl?: string; timeout?: number }) {
    this.apiKey = apiKey;
    this.baseUrl = (opts?.baseUrl ?? process.env.OXA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
  }

  private async request<T>(path: string, params: Record<string, unknown>): Promise<ApiEnvelope<T>> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
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
      const rawData = await response.json();
      const data = transformKeys(rawData) as ApiEnvelope<T>;

      if (!response.ok) {
        throw new OxArchiveError(
          data.error || `Request failed with status ${response.status}`,
          response.status,
          data.meta?.requestId,
        );
      }
      return data;
    } catch (error) {
      if (error instanceof OxArchiveError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OxArchiveError(`Request timeout after ${this.timeout}ms`, 408);
      }
      throw new OxArchiveError(error instanceof Error ? error.message : 'Unknown error', 500);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async history(
    symbol: string,
    params: SpotCandleHistoryParams,
  ): Promise<SpotCandleCursorResponse<any[]>> {
    const envelope = await this.request<any>(
      `${SPOT_CANDLES_PATH}/${encodeURIComponent(symbol)}`,
      params as unknown as Record<string, unknown>,
    );

    if (envelope && typeof envelope === 'object' && 'data' in envelope) {
      return {
        data: (envelope.data as any[]) ?? [],
        nextCursor: envelope.meta?.nextCursor,
      };
    }

    return { data: envelope as unknown as any[] };
  }
}
