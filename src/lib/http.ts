// The request path for the few routes the CLI calls without an SDK resource
// (HIP-4 through `Hip4Client` and Spot candles through `SpotCandlesClient`).
// It follows the same API contract as the SDK: it selects the API version the
// CLI is written against, keeps the API's `error_code`, `request_id`, `param`
// and `valid_values` on failures, and reads `has_more` on paged responses.

import { OxArchiveError } from '@0xarchive/sdk';

/**
 * The dated API contract the CLI is written against. Every request sends it
 * as `0xArchive-Version`, and WebSocket connections add it as `version`.
 */
export const API_VERSION = '2026-10-01';

/** Request header that selects the API version. */
export const API_VERSION_HEADER = '0xArchive-Version';

export const DEFAULT_BASE_URL = 'https://api.0xarchive.io';
const DEFAULT_TIMEOUT = 30_000;

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Rewrite snake_case keys to camelCase, as the SDK does. */
export function transformKeys(obj: unknown): unknown {
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

/** One page of a cursor-paged route: rows, `nextCursor`, `hasMore` and the response `meta`. */
export interface CursorPage<T> {
  data: T;
  nextCursor?: string;
  hasMore: boolean;
  meta?: Record<string, unknown>;
}

/**
 * Build the SDK error for a failed response from its (camelCased) body, with
 * the API's `errorCode`, `requestId`, `param` and `validValues`.
 */
export function apiError(status: number, body: unknown): OxArchiveError {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const message =
    typeof b.error === 'string' && b.error
      ? b.error
      : typeof b.message === 'string' && b.message
        ? b.message
        : `Request failed with status ${status}`;
  const meta = b.meta && typeof b.meta === 'object' ? (b.meta as Record<string, unknown>) : undefined;
  const requestId =
    typeof b.requestId === 'string' ? b.requestId : typeof meta?.requestId === 'string' ? meta.requestId : undefined;
  const error = new OxArchiveError(message, status, requestId);
  // Assigned rather than passed to the constructor so this also builds on an
  // SDK release whose constructor predates these fields.
  const extra: Record<string, unknown> = {};
  if (typeof b.errorCode === 'string') extra.errorCode = b.errorCode;
  if (typeof b.param === 'string') extra.param = b.param;
  if (Array.isArray(b.validValues)) extra.validValues = b.validValues.filter((v) => typeof v === 'string');
  return Object.assign(error, extra);
}

/** Read a paged response envelope into a {@link CursorPage}. */
export function cursorPage<T>(envelope: unknown, fallback: T): CursorPage<T> {
  if (envelope && typeof envelope === 'object' && !Array.isArray(envelope) && 'data' in envelope) {
    const e = envelope as { data?: T; meta?: Record<string, unknown> };
    const meta = e.meta && typeof e.meta === 'object' ? e.meta : undefined;
    const cursor = meta?.nextCursor;
    const nextCursor = typeof cursor === 'string' && cursor !== '' ? cursor : undefined;
    const hasMore = typeof meta?.hasMore === 'boolean' ? meta.hasMore : nextCursor !== undefined;
    return { data: (e.data as T) ?? fallback, nextCursor, hasMore, ...(meta ? { meta } : {}) };
  }
  // A bare payload with no envelope: one page, nothing after it.
  return { data: (envelope as T) ?? fallback, hasMore: false };
}

/** A GET-only client for the routes the CLI calls directly. */
export class ApiHttpClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(
    private readonly apiKey: string,
    opts?: { baseUrl?: string; timeout?: number },
  ) {
    this.baseUrl = (opts?.baseUrl ?? process.env.OXA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
  }

  /** GET `path` with `params`; resolves to the camelCased body, rejects with an SDK error. */
  async get(path: string, params?: Record<string, unknown>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
          [API_VERSION_HEADER]: API_VERSION,
        },
        signal: controller.signal,
      });

      let raw: unknown;
      try {
        raw = await response.json();
      } catch (parseError) {
        // A non-JSON body (for example a proxy error page) keeps its status.
        if (!response.ok) throw new OxArchiveError(`Request failed with status ${response.status}`, response.status);
        throw parseError;
      }
      const body = transformKeys(raw);
      if (!response.ok) throw apiError(response.status, body);
      return body;
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
}
