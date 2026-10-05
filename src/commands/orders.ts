import {
  resolveApiKey,
  validateExchange,
  requireExchange,
  createClient,
  getExchangeClient,
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
import { parseTimestamp, parseLimit } from '../lib/time.js';
import { writeOutputFile } from '../lib/file.js';
import { getTriggerLevelsResource, hyperliquidVenue } from '../lib/sdk.js';
import { levelHistoryParams, levelParams, type LevelHistoryOptions, type LevelOptions } from '../lib/levels.js';
import { cell, emitDocument, emitPage, field, hasMore, pageEnvelope, printMore, printNextPage, toPage } from '../lib/emit.js';
import { parseBoolean } from '../lib/params.js';
import { spotOrdersHistory } from './spot.js';

// ── oxa orders history ──────────────────────────────────────────────────

interface OrdersHistoryOptions {
  exchange: string;
  symbol: string;
  start: string;
  end: string;
  user?: string;
  status?: string;
  orderType?: string;
  triggered?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function ordersHistoryCommand(options: OrdersHistoryOptions): Promise<void> {
  if (options.exchange === 'spot') {
    // Spot order history takes the time range and cursor only.
    const filter = (['user', 'status', 'orderType', 'triggered'] as const).find((key) => options[key] !== undefined);
    if (filter) {
      const flag = filter === 'orderType' ? 'order-type' : filter;
      exitError(`--${flag} is not available on Spot order history, which takes the time range and cursor only.`, EXIT.VALIDATION);
    }
    const { exchange: _exchange, symbol, user: _u, status: _s, orderType: _o, triggered: _t, ...rest } = options;
    return spotOrdersHistory(symbol, rest);
  }
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  requireExchange(exchange, ['hyperliquid', 'hip3', 'hip4'], 'order history', ['spot']);
  const triggered = parseBoolean(options.triggered, 'triggered');
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange, apiKey);
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;
    if (options.user) sdkParams.user = options.user;
    if (options.status) sdkParams.status = options.status;
    if (options.orderType) sdkParams.order_type = options.orderType;
    if (triggered !== undefined) sdkParams.triggered = triggered;

    const result = await (exchangeClient as any).orders.history(options.symbol, sdkParams);
    const orders = result.data;
    const envelope = pageEnvelope(result, orders);

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: orders.length,
        exchange,
        symbol: options.symbol,
        has_more: hasMore(result),
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} Order History (${exchange})`);
        prettyField('Records', orders.length);
        prettyField('Written to', options.out);
        prettyField('Has more', hasMore(result) ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} Order History (${exchange}): ${orders.length} records`);
      if (orders.length === 0) {
        prettyDim('No orders found.');
      } else {
        const preview = orders.slice(0, 20);
        const rows = preview.map((o: any) => [
          cell(o.timestamp),
          o.side === 'B' ? 'BUY' : 'SELL',
          cell(field(o, 'price', 'limitPrice', 'limit_price')),
          cell(o.size),
          cell(o.status),
          cell(field(o, 'user', 'userAddress', 'user_address')),
        ]);
        prettyTable(['Timestamp', 'Side', 'Price', 'Size', 'Status', 'User'], rows);
        if (orders.length > 20) prettyDim(`... and ${orders.length - 20} more`);
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

// ── oxa orders flow ─────────────────────────────────────────────────────

interface OrdersFlowOptions {
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

export async function ordersFlowCommand(options: OrdersFlowOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  requireExchange(exchange, ['hyperliquid', 'hip3', 'hip4'], 'order flow');
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange, apiKey);
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.interval) sdkParams.interval = options.interval;
    if (options.cursor) sdkParams.cursor = options.cursor;

    const result = await (exchangeClient as any).orders.flow(options.symbol, sdkParams);
    const data = result.data;
    const envelope = pageEnvelope(result, data);

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: data.length,
        exchange,
        symbol: options.symbol,
        has_more: hasMore(result),
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} Order Flow (${exchange})`);
        prettyField('Records', data.length);
        prettyField('Written to', options.out);
        prettyField('Has more', hasMore(result) ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} Order Flow (${exchange}): ${data.length} records`);
      if (data.length === 0) {
        prettyDim('No order flow data found.');
      } else {
        outputJson(envelope);
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

// ── oxa orders tpsl ─────────────────────────────────────────────────────

interface OrdersTpslOptions {
  exchange: string;
  symbol: string;
  start: string;
  end: string;
  user?: string;
  triggered?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function ordersTpslCommand(options: OrdersTpslOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  requireExchange(exchange, ['hyperliquid', 'hip3', 'hip4'], 'TP/SL order');
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange, apiKey);
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;
    if (options.user) sdkParams.user = options.user;
    if (options.triggered !== undefined) sdkParams.triggered = options.triggered === 'true';

    const result = await (exchangeClient as any).orders.tpsl(options.symbol, sdkParams);
    const orders = result.data;
    const envelope = pageEnvelope(result, orders);

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: orders.length,
        exchange,
        symbol: options.symbol,
        has_more: hasMore(result),
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} TP/SL Orders (${exchange})`);
        prettyField('Records', orders.length);
        prettyField('Written to', options.out);
        prettyField('Has more', hasMore(result) ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} TP/SL Orders (${exchange}): ${orders.length} records`);
      if (orders.length === 0) {
        prettyDim('No TP/SL orders found.');
      } else {
        const preview = orders.slice(0, 20);
        const rows = preview.map((o: any) => [
          o.timestamp,
          o.side === 'B' ? 'BUY' : 'SELL',
          o.trigger_price ?? '',
          o.size,
          o.triggered ? 'YES' : 'NO',
          o.user ?? '',
        ]);
        prettyTable(['Timestamp', 'Side', 'Trigger Price', 'Size', 'Triggered', 'User'], rows);
        if (orders.length > 20) prettyDim(`... and ${orders.length - 20} more`);
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

// ── oxa orders trigger-levels / trigger-levels-history ──────────────────
// Pending stop-loss and take-profit trigger orders grouped into price buckets
// (Hyperliquid and HIP-3). History is kept at a 15-minute cadence from
// 2026-07-27. These are voluntary trigger orders, not projected forced
// liquidations; see `oxa liquidations levels` for those.

interface TriggerLevelsOptions extends LevelOptions {
  exchange: string;
  symbol: string;
  apiKey?: string;
  format: string;
}

interface TriggerLevelsHistoryOptions extends LevelHistoryOptions {
  exchange: string;
  symbol: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function ordersTriggerLevelsCommand(options: TriggerLevelsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, 'trigger levels');
  const params = levelParams(options);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  const triggers = getTriggerLevelsResource(client, venue);
  try {
    const snapshot = await triggers.triggerLevels(options.symbol, params);
    emitDocument(snapshot, { format }, () => {
      prettyHeader(`${options.symbol} Trigger Levels (${exchangeLabel(venue)})`);
      prettyField('As of', field(snapshot, 'asOf', 'as_of') as string | undefined);
      prettyField('Mid price', field(snapshot, 'midPrice', 'mid_price') as number | undefined);
      prettyField('Total bid size', field(snapshot, 'totalBidSize', 'total_bid_size') as number | undefined);
      prettyField('Total ask size', field(snapshot, 'totalAskSize', 'total_ask_size') as number | undefined);
      const levels = field(snapshot, 'levels');
      const rows = (Array.isArray(levels) ? levels : []).map((b) => [
        cell(field(b, 'priceBucket', 'price_bucket')),
        cell(field(b, 'bidCount', 'bid_count')),
        cell(field(b, 'bidSize', 'bid_size')),
        cell(field(b, 'askCount', 'ask_count')),
        cell(field(b, 'askSize', 'ask_size')),
      ]);
      if (rows.length === 0) {
        prettyDim('No pending trigger orders in this range.');
      } else {
        prettyTable(['Price Bucket', 'Bid Orders', 'Bid Size', 'Ask Orders', 'Ask Size'], rows);
      }
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function ordersTriggerLevelsHistoryCommand(options: TriggerLevelsHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, 'trigger levels');
  const params = levelHistoryParams(options);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  const triggers = getTriggerLevelsResource(client, venue);
  try {
    const result = await triggers.triggerLevelsHistory(options.symbol, params);
    const page = toPage(result);
    const snapshots = Array.isArray(page.data) ? page.data : [];
    emitPage(page, { format, out: options.out }, { exchange: venue, symbol: options.symbol }, () => {
      prettyHeader(`${options.symbol} Trigger Levels History (${exchangeLabel(venue)}), ${snapshots.length} snapshots`);
      if (snapshots.length === 0) {
        prettyDim('No snapshots found.');
        return;
      }
      const shown = snapshots.slice(0, 20);
      prettyTable(
        ['Snapshot', 'Mid Price', 'Total Bid Size', 'Total Ask Size', 'Buckets'],
        shown.map((s) => {
          const levels = field(s, 'levels');
          return [
            cell(field(s, 'snapshotTs', 'snapshot_ts')),
            cell(field(s, 'midPrice', 'mid_price')),
            cell(field(s, 'totalBidSize', 'total_bid_size')),
            cell(field(s, 'totalAskSize', 'total_ask_size')),
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
