import {
  resolveApiKey,
  validateExchange,
  createClient,
  getExchangeClient,
  isLighterExchange,
  sdkTooOld,
  exchangeLabel,
  type Exchange,
} from '../lib/client.js';
import {
  outputJson,
  validateFormat,
  prettyHeader,
  prettyField,
  prettyTable,
  prettyDim,
  EXIT,
  exitError,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { writeOutputFile } from '../lib/file.js';
import { exampleRange, parseTimestamp, parseLimit } from '../lib/time.js';
import { getLiquidationLevelsResource, hyperliquidVenue } from '../lib/sdk.js';
import { levelHistoryParams, levelParams, type LevelHistoryOptions, type LevelOptions } from '../lib/levels.js';
import { cell, emitDocument, emitPage, field, pageEnvelope, printMore, printNextPage, toPage } from '../lib/emit.js';

interface LiquidationsOptions {
  exchange: string;
  symbol: string;
  start?: string;
  end?: string;
  limit?: string;
  cursor?: string;
  apiKey?: string;
  format: string;
}

interface LiquidationsVolumeOptions {
  exchange: string;
  symbol: string;
  start: string;
  end: string;
  interval?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

interface LiquidationsUserOptions {
  exchange: string;
  user: string;
  start: string;
  end: string;
  coin?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

// Liquidation history and volume: Hyperliquid, HIP-3, and both Lighter
// deployments. Lookup by user is Hyperliquid only.
export const LIQUIDATION_EXCHANGES = ['hyperliquid', 'hip3', 'lighter', 'rh-lighter'] as const;

export function validateLiquidationExchange(exchange: Exchange): void {
  if (exchange === 'hip4') {
    exitError(
      'HIP-4 has no liquidations endpoint. Use --exchange hyperliquid, hip3, lighter, or rh-lighter.',
      EXIT.VALIDATION,
    );
  }
  if (!(LIQUIDATION_EXCHANGES as readonly string[]).includes(exchange)) {
    exitError(
      `Liquidations are available for ${LIQUIDATION_EXCHANGES.join(', ')}. Got "${exchange}".`,
      EXIT.VALIDATION,
    );
  }
}

// The liquidations resource on the chosen exchange client. Both Lighter
// clients gained it in the SDK floor release.
function liquidationsResource(client: ReturnType<typeof createClient>, exchange: Exchange): any {
  const resource = (getExchangeClient(client, exchange) as any).liquidations;
  if (!resource) sdkTooOld(`Lighter liquidations (--exchange ${exchange})`);
  return resource;
}

function isoTime(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return value === undefined || value === null ? '-' : String(value);
}

export async function liquidationsCommand(options: LiquidationsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  validateLiquidationExchange(exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);

  if (!options.start || !options.end) {
    exitError(
      'Liquidations require --start and --end.\n' +
        'Example: oxa liquidations history --exchange hyperliquid --symbol BTC ' +
        exampleRange(1),
      EXIT.VALIDATION,
    );
  }

  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const result = await liquidationsResource(client, exchange).history(options.symbol, {
      start,
      end,
      limit,
      cursor: options.cursor,
    });
    const liqs = result.data;
    const envelope = pageEnvelope(result, liqs);

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Liquidations (${exchange}): ${liqs.length} records`);

      if (liqs.length === 0) {
        prettyDim('No liquidations found.');
      } else {
        const preview = liqs.slice(0, 20);
        if (isLighterExchange(exchange)) {
          // Lighter rows carry the liquidation type and USD amount; the
          // liquidated side is not flagged on the trade.
          const rows = preview.map((l: any) => [
            isoTime(l.timestamp),
            String(l.liquidationType ?? l.liquidation_type ?? '-'),
            String(l.price ?? '-'),
            String(l.size ?? '-'),
            String(l.usdAmount ?? l.usd_amount ?? '-'),
          ]);
          prettyTable(['Timestamp', 'Type', 'Price', 'Size', 'USD'], rows);
        } else {
          const rows = preview.map((l: any) => [
            l.timestamp,
            l.side === 'B' ? 'LONG' : 'SHORT',
            l.price,
            l.size,
            l.liquidatedUser ? l.liquidatedUser.slice(0, 10) + '...' : '-',
          ]);
          prettyTable(['Timestamp', 'Side', 'Price', 'Size', 'User'], rows);
        }

        if (liqs.length > 20) {
          prettyDim(`... and ${liqs.length - 20} more`);
        }
        printNextPage(result);
      }
      process.stdout.write('\n');
    } else {
      outputJson(envelope);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function liquidationsVolumeCommand(options: LiquidationsVolumeOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  validateLiquidationExchange(exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const result = await liquidationsResource(client, exchange).volume(options.symbol, {
      start,
      end,
      interval: options.interval,
      limit,
      cursor: options.cursor,
    });
    const buckets = result.data;
    const envelope = pageEnvelope(result, buckets);

    if (options.out) {
      writeOutputFile(options.out, envelope);
    }

    if (format === 'pretty') {
      prettyHeader(`${options.symbol} Liquidation Volume (${exchange}): ${buckets.length} buckets`);

      if (buckets.length === 0) {
        prettyDim('No volume data found.');
      } else {
        const preview = buckets.slice(0, 20);
        if (isLighterExchange(exchange)) {
          // Lighter buckets carry the total and a count, with no long/short split.
          const rows = preview.map((b: any) => [
            isoTime(b.timestamp),
            `$${b.totalUsd ?? b.total_usd}`,
            String(b.count ?? '-'),
          ]);
          prettyTable(['Timestamp', 'Total USD', 'Count'], rows);
        } else {
          const rows = preview.map((b: any) => [
            b.timestamp,
            `$${b.totalUsd}`,
            `$${b.longUsd}`,
            `$${b.shortUsd}`,
          ]);
          prettyTable(['Timestamp', 'Total USD', 'Long USD', 'Short USD'], rows);
        }

        if (buckets.length > 20) {
          prettyDim(`... and ${buckets.length - 20} more`);
        }
        printNextPage(result);
      }
      process.stdout.write('\n');
    } else {
      outputJson(envelope);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function liquidationsUserCommand(options: LiquidationsUserOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  validateLiquidationExchange(exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  if (exchange !== 'hyperliquid') {
    exitError(
      'Liquidations by user is only available for --exchange hyperliquid.',
      EXIT.VALIDATION,
    );
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const hlClient = exchangeClient as any;
    const result = await hlClient.liquidations.byUser(options.user, {
      start,
      end,
      coin: options.coin,
      limit,
      cursor: options.cursor,
    });
    const liqs = result.data;
    const envelope = pageEnvelope(result, liqs);

    if (options.out) {
      writeOutputFile(options.out, envelope);
    }

    if (format === 'pretty') {
      prettyHeader(`Liquidations for ${options.user.slice(0, 10)}... (${exchange}): ${liqs.length} records`);

      if (liqs.length === 0) {
        prettyDim('No liquidations found for this user.');
      } else {
        const preview = liqs.slice(0, 20);
        const rows = preview.map((l: any) => [
          l.timestamp,
          l.coin ?? '-',
          l.side === 'B' ? 'LONG' : 'SHORT',
          l.price,
          l.size,
        ]);
        prettyTable(['Timestamp', 'Coin', 'Side', 'Price', 'Size'], rows);

        if (liqs.length > 20) {
          prettyDim(`... and ${liqs.length - 20} more`);
        }
        printNextPage(result);
      }
      process.stdout.write('\n');
    } else {
      outputJson(envelope);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa liquidations levels / levels-history ────────────────────────────
// Projected forced-liquidation levels (Hyperliquid and HIP-3), computed from
// clearinghouse positions and margin state about every five minutes, with
// history from 2026-07-27. These are not pending trigger orders; see
// `oxa orders trigger-levels` for those.

interface LiquidationLevelsOptions extends LevelOptions {
  exchange: string;
  symbol: string;
  at?: string;
  apiKey?: string;
  format: string;
}

interface LiquidationLevelsHistoryOptions extends LevelHistoryOptions {
  exchange: string;
  symbol: string;
  out?: string;
  apiKey?: string;
  format: string;
}

function liquidationLevelRows(levels: unknown): string[][] {
  return (Array.isArray(levels) ? levels : []).map((b) => [
    cell(field(b, 'price')),
    cell(field(b, 'longNotional', 'long_notional')),
    cell(field(b, 'longCount', 'long_count')),
    cell(field(b, 'shortNotional', 'short_notional')),
    cell(field(b, 'shortCount', 'short_count')),
  ]);
}

export async function liquidationsLevelsCommand(options: LiquidationLevelsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, 'liquidation levels');
  const params = levelParams(options);
  if (options.at !== undefined) params.at = parseTimestamp(options.at, 'at');
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  const levels = getLiquidationLevelsResource(client, venue);
  try {
    const snapshot = await levels.levels(options.symbol, params);
    emitDocument(snapshot, { format }, () => {
      prettyHeader(`${options.symbol} Liquidation Levels (${exchangeLabel(venue)})`);
      prettyField('Snapshot', field(snapshot, 'snapshotTs', 'snapshot_ts') as string | undefined);
      prettyField('Block', field(snapshot, 'blockNumber', 'block_number') as number | undefined);
      prettyField('Mid price', field(snapshot, 'midPrice', 'mid_price') as number | undefined);
      prettyField('Total long at risk', field(snapshot, 'totalLong', 'total_long') as number | undefined);
      prettyField('Total short at risk', field(snapshot, 'totalShort', 'total_short') as number | undefined);
      prettyField('Flagged notional', field(snapshot, 'flaggedNotional', 'flagged_notional') as number | undefined);
      const rows = liquidationLevelRows(field(snapshot, 'levels'));
      if (rows.length === 0) {
        prettyDim('No levels in this range.');
      } else {
        prettyTable(['Price', 'Long Notional', 'Longs', 'Short Notional', 'Shorts'], rows);
      }
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function liquidationsLevelsHistoryCommand(options: LiquidationLevelsHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, 'liquidation levels');
  const params = levelHistoryParams(options);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  const levels = getLiquidationLevelsResource(client, venue);
  try {
    const result = await levels.levelsHistory(options.symbol, params);
    const page = toPage(result);
    const snapshots = Array.isArray(page.data) ? page.data : [];
    emitPage(page, { format, out: options.out }, { exchange: venue, symbol: options.symbol }, () => {
      prettyHeader(`${options.symbol} Liquidation Levels History (${exchangeLabel(venue)}), ${snapshots.length} snapshots`);
      if (snapshots.length === 0) {
        prettyDim('No snapshots found.');
        return;
      }
      const shown = snapshots.slice(0, 20);
      prettyTable(
        ['Snapshot', 'Mid Price', 'Total Long', 'Total Short', 'Flagged', 'Buckets'],
        shown.map((s) => {
          const levels = field(s, 'levels');
          return [
            cell(field(s, 'snapshotTs', 'snapshot_ts')),
            cell(field(s, 'midPrice', 'mid_price')),
            cell(field(s, 'totalLong', 'total_long')),
            cell(field(s, 'totalShort', 'total_short')),
            cell(field(s, 'flaggedNotional', 'flagged_notional')),
            Array.isArray(levels) ? String(levels.length) : '-',
          ];
        }),
      );
      printMore(shown.length, snapshots.length, page);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
