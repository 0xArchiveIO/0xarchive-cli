// Account positions through the @0xarchive/sdk positions resources.
//
// Every venue client (hyperliquid, hip3, lighter, rhLighter) carries a
// `positions` resource; the Hyperliquid and HIP-3 ones add account summaries,
// and the mainnet Lighter client carries `accounts.byL1`. The interfaces below
// describe the calls the CLI makes, so the commands type-check on their own
// and fail with a clear message on an SDK install older than the floor.

import type { OxArchive } from '@0xarchive/sdk';
import { exchangeLabel, getRhLighterClient, sdkTooOld } from './client.js';

export type PositionsExchange = 'hyperliquid' | 'hip3' | 'lighter' | 'rh-lighter';

export const POSITIONS_EXCHANGES: readonly PositionsExchange[] = ['hyperliquid', 'hip3', 'lighter', 'rh-lighter'];

/** Account summaries (`account`, `accountHistory`) are Hyperliquid and HIP-3 only. */
export const ACCOUNT_EXCHANGES: readonly PositionsExchange[] = ['hyperliquid', 'hip3'];

/** A wallet address on Hyperliquid and HIP-3; an integer account index on Lighter. */
export type PositionsKey = string | number;

export interface WalletPositionsParams {
  timestamp?: number;
  symbol?: string;
  dex?: string;
  cursor?: string;
  limit?: number;
}

export interface PositionsRangeParams {
  start: number;
  end: number;
  symbol?: string;
  dex?: string;
  cursor?: string;
  limit?: number;
}

export interface MarketPositionsParams {
  hour?: number;
  side?: 'long' | 'short';
  minValue?: number;
  includeSystem?: boolean;
  cursor?: string;
  limit?: number;
}

export interface MarketSummaryParams {
  start?: number;
  end?: number;
  includeSystem?: boolean;
  cursor?: string;
  limit?: number;
}

export interface BulkPositionsParams {
  hour: number;
  includeSystem?: boolean;
  cursor?: string;
  limit?: number;
}

export interface AccountParams {
  dex?: string;
}

export interface AccountHistoryParams {
  start: number;
  end: number;
  dex?: string;
  cursor?: string;
  limit?: number;
}

export interface PositionsResource {
  get(key: PositionsKey, params?: WalletPositionsParams): Promise<unknown>;
  history(key: PositionsKey, params: PositionsRangeParams): Promise<unknown>;
  changes(key: PositionsKey, params: PositionsRangeParams): Promise<unknown>;
  market(symbol: string, params?: MarketPositionsParams): Promise<unknown>;
  marketSummary(symbol: string, params?: MarketSummaryParams): Promise<unknown>;
  all(params: BulkPositionsParams): Promise<unknown>;
  account?(address: string, params?: AccountParams): Promise<unknown>;
  accountHistory?(address: string, params: AccountHistoryParams): Promise<unknown>;
}

export interface LighterAccountsResource {
  byL1(l1Address: string, params?: { cursor?: string; limit?: number }): Promise<unknown>;
}

function venueClient(client: OxArchive, exchange: PositionsExchange): unknown {
  switch (exchange) {
    case 'hyperliquid':
      return client.hyperliquid;
    case 'hip3':
      return client.hyperliquid.hip3;
    case 'lighter':
      return client.lighter;
    case 'rh-lighter':
      return getRhLighterClient(client);
  }
}

export function getPositionsResource(client: OxArchive, exchange: PositionsExchange): PositionsResource {
  const positions = (venueClient(client, exchange) as { positions?: PositionsResource } | undefined)?.positions;
  if (!positions) sdkTooOld(`${exchangeLabel(exchange)} positions`);
  return positions;
}

export function getLighterAccountsResource(client: OxArchive): LighterAccountsResource {
  const accounts = (client.lighter as unknown as { accounts?: LighterAccountsResource }).accounts;
  if (!accounts) sdkTooOld('Lighter account lookup');
  return accounts;
}

/** Drop undefined values so only the flags the user passed reach the SDK. */
export function compact<T extends object>(params: T): T {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as T;
}

export interface PageEnvelope {
  data: unknown;
  nextCursor: string | null;
  /** True while another page follows. */
  has_more: boolean;
  meta?: Record<string, unknown>;
}

/**
 * Normalize an SDK result into the CLI's JSON envelope: `data`, `nextCursor`,
 * `has_more`, and `meta` when the SDK returns response meta (as_of,
 * snapshot_ts, source, quality, stale, built_through, finalized_through,
 * totals, notices).
 */
export function toEnvelope(result: unknown): PageEnvelope {
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    const meta = r.meta !== null && typeof r.meta === 'object' ? (r.meta as Record<string, unknown>) : undefined;
    const cursor = r.nextCursor ?? meta?.nextCursor ?? null;
    const nextCursor = typeof cursor === 'string' && cursor !== '' ? cursor : null;
    const hasMore =
      typeof r.hasMore === 'boolean'
        ? r.hasMore
        : typeof meta?.hasMore === 'boolean'
          ? meta.hasMore
          : nextCursor !== null;
    let data: unknown;
    if ('data' in r) {
      data = r.data;
    } else {
      const { meta: _meta, nextCursor: _next, hasMore: _hasMore, ...rest } = r;
      data = rest;
    }
    return meta ? { data, nextCursor, has_more: hasMore, meta } : { data, nextCursor, has_more: hasMore };
  }
  return { data: result, nextCursor: null, has_more: false };
}

/** Read a field that may arrive camelCase (SDK) or snake_case (raw API). */
export function field(obj: unknown, ...keys: string[]): unknown {
  if (obj === null || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

export function text(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function shortAddress(address: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}
