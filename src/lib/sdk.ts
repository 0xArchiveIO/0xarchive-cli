// The @0xarchive/sdk resources added in the SDK floor release: breadth, CVD,
// the HIP-3 oracle, HIP-4 questions, wallet classification, the symbol
// universe, liquidation and trigger levels, and webhooks.
//
// The interfaces below describe the calls the CLI makes, so the commands
// type-check on their own and fail with a clear message on an SDK install
// older than the floor, the same way the positions commands do.

import type { OxArchive } from '@0xarchive/sdk';
import * as sdk from '@0xarchive/sdk';
import { exchangeLabel, requireExchange, sdkTooOld, validateExchange } from './client.js';

/** The Hyperliquid venues that serve breadth, CVD, wallets, and levels. */
export type HyperliquidVenue = 'hyperliquid' | 'hip3';

export const HYPERLIQUID_VENUES: readonly HyperliquidVenue[] = ['hyperliquid', 'hip3'];

/** Validate `--exchange` for a route served on Hyperliquid core and HIP-3 only. */
export function hyperliquidVenue(raw: string, feature: string): HyperliquidVenue {
  const exchange = validateExchange(raw);
  requireExchange(exchange, HYPERLIQUID_VENUES, feature);
  return exchange;
}

/** One page of a cursor-paged SDK method. */
export interface SdkPage<T = unknown> {
  data: T;
  nextCursor?: string;
  meta?: Record<string, unknown>;
}

export interface BreadthResource {
  current(): Promise<unknown>;
  history(params?: Record<string, unknown>): Promise<SdkPage<unknown[]>>;
}

export interface CvdResource {
  history(symbol: string, params?: Record<string, unknown>): Promise<SdkPage<unknown[]>>;
}

export interface OracleResource {
  externalPrice(symbol: string): Promise<unknown>;
  discoveryBounds(symbol: string): Promise<unknown>;
}

export interface QuestionsResource {
  list(params?: Record<string, unknown>): Promise<SdkPage<unknown[]>>;
  get(questionId: number | string): Promise<unknown>;
}

export interface WalletsResource {
  classify(params?: Record<string, unknown>): Promise<unknown>;
}

export interface SymbolsResource {
  list(): Promise<unknown[]>;
}

export interface LiquidationLevelsResource {
  levels(symbol: string, params?: Record<string, unknown>): Promise<unknown>;
  levelsHistory(symbol: string, params?: Record<string, unknown>): Promise<SdkPage<unknown[]>>;
}

export interface TriggerLevelsResource {
  triggerLevels(symbol: string, params?: Record<string, unknown>): Promise<unknown>;
  triggerLevelsHistory(symbol: string, params?: Record<string, unknown>): Promise<SdkPage<unknown[]>>;
}

export interface WebhooksResource {
  eventTypes(): Promise<unknown[]>;
  limits(): Promise<unknown>;
  listEndpoints(): Promise<unknown[]>;
  createEndpoint(params: { url: string; description?: string }): Promise<unknown>;
  deleteEndpoint(endpointId: string): Promise<void>;
  enableEndpoint(endpointId: string): Promise<void>;
  rotateSecret(endpointId: string): Promise<unknown>;
  testEndpoint(endpointId: string): Promise<unknown>;
  listDeliveries(endpointId: string, params?: { limit?: number }): Promise<unknown[]>;
  redeliver(deliveryId: string): Promise<unknown>;
  listSubscriptions(): Promise<unknown[]>;
  createSubscription(params: {
    endpointId: string;
    eventType: string;
    filters?: Record<string, unknown>;
  }): Promise<unknown>;
  updateSubscription(
    subscriptionId: string,
    params: { filters?: Record<string, unknown>; enabled?: boolean },
  ): Promise<unknown>;
  deleteSubscription(subscriptionId: string): Promise<void>;
  resumeSubscription(subscriptionId: string): Promise<unknown>;
  resumeAllSubscriptions(): Promise<unknown>;
  estimate(params: {
    eventType: string;
    config?: Record<string, unknown>;
    lookbackDays?: number;
  }): Promise<unknown>;
  dryRun(params: {
    eventType: string;
    config?: Record<string, unknown>;
    lookbackS?: number;
    limit?: number;
  }): Promise<unknown>;
  listAddresses(): Promise<unknown>;
  addAddress(params: { address: string; label?: string }): Promise<unknown>;
  deleteAddress(addressId: string): Promise<void>;
}

/** The SDK's webhook signature helpers, used by `oxa webhooks verify`. */
export interface WebhookVerifier {
  constructWebhookEvent(options: {
    payload: Uint8Array | string;
    secret: string | string[];
    signature?: string;
    toleranceSeconds?: number;
    subtle?: unknown;
  }): Promise<Record<string, unknown>>;
  parseWebhookSignatureHeader(
    header: string,
  ): { timestamp: string; timestampSeconds: number; signatures: string[] } | null;
  WebhookSignatureError: new (...args: never[]) => Error & { reason: string };
}

type BreadthResourceClass = new (http: unknown, basePath: string) => BreadthResource;

function venueClient(client: OxArchive, venue: HyperliquidVenue): unknown {
  return venue === 'hip3' ? client.hyperliquid.hip3 : client.hyperliquid;
}

function resource<T>(owner: unknown, name: string, feature: string): T {
  const value = (owner as Record<string, unknown> | undefined)?.[name];
  if (!value) sdkTooOld(feature);
  return value as T;
}

/**
 * Breadth above the UTC-session VWAP. HIP-3 is `client.hyperliquid.hip3.breadth`.
 * The SDK serves Hyperliquid core breadth through the same resource class, bound
 * to the core route family, until the core client carries a `breadth` resource
 * of its own.
 */
export function getBreadthResource(client: OxArchive, venue: HyperliquidVenue): BreadthResource {
  const own = (venueClient(client, venue) as { breadth?: BreadthResource }).breadth;
  if (own) return own;
  const ResourceClass = (sdk as unknown as { Hip3BreadthResource?: BreadthResourceClass }).Hip3BreadthResource;
  const http = (client as unknown as { http?: unknown }).http;
  if (venue !== 'hyperliquid' || !ResourceClass || !http) sdkTooOld(`${exchangeLabel(venue)} breadth`);
  return new ResourceClass(http, '/v1/hyperliquid');
}

export function getCvdResource(client: OxArchive, venue: HyperliquidVenue): CvdResource {
  return resource<CvdResource>(venueClient(client, venue), 'cvd', `${exchangeLabel(venue)} CVD`);
}

export function getWalletsResource(client: OxArchive, venue: HyperliquidVenue): WalletsResource {
  return resource<WalletsResource>(venueClient(client, venue), 'wallets', 'wallet classification');
}

export function getLiquidationLevelsResource(
  client: OxArchive,
  venue: HyperliquidVenue,
): LiquidationLevelsResource {
  const liquidations = resource<Partial<LiquidationLevelsResource>>(
    venueClient(client, venue),
    'liquidations',
    'liquidation levels',
  );
  if (typeof liquidations.levels !== 'function' || typeof liquidations.levelsHistory !== 'function') {
    sdkTooOld('liquidation levels');
  }
  return liquidations as LiquidationLevelsResource;
}

export function getTriggerLevelsResource(client: OxArchive, venue: HyperliquidVenue): TriggerLevelsResource {
  const orders = resource<Partial<TriggerLevelsResource>>(venueClient(client, venue), 'orders', 'trigger levels');
  if (typeof orders.triggerLevels !== 'function' || typeof orders.triggerLevelsHistory !== 'function') {
    sdkTooOld('trigger levels');
  }
  return orders as TriggerLevelsResource;
}

export function getHip3OracleResource(client: OxArchive): OracleResource {
  return resource<OracleResource>(client.hyperliquid.hip3, 'oracle', 'the HIP-3 oracle');
}

export function getHip4QuestionsResource(client: OxArchive): QuestionsResource {
  const hip4 = (client.hyperliquid as unknown as { hip4?: unknown }).hip4;
  return resource<QuestionsResource>(hip4, 'questions', 'HIP-4 questions');
}

export function getSymbolsResource(client: OxArchive): SymbolsResource {
  return resource<SymbolsResource>(client, 'symbols', 'the symbol list');
}

export function getWebhooksResource(client: OxArchive): WebhooksResource {
  return resource<WebhooksResource>(client, 'webhooks', 'webhooks');
}

export function getWebhookVerifier(): WebhookVerifier {
  const api = sdk as unknown as Partial<WebhookVerifier>;
  if (
    typeof api.constructWebhookEvent !== 'function' ||
    typeof api.parseWebhookSignatureHeader !== 'function' ||
    typeof api.WebhookSignatureError !== 'function'
  ) {
    sdkTooOld('webhook signature verification');
  }
  return api as WebhookVerifier;
}
