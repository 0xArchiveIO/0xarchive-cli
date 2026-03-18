import {
  resolveApiKey,
  validateExchange,
  createClient,
  getExchangeClient,
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

// ── oxa orders history ──────────────────────────────────────────────────

interface OrdersHistoryOptions {
  exchange: string;
  symbol: string;
  start: string;
  end: string;
  user?: string;
  status?: string;
  orderType?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function ordersHistoryCommand(options: OrdersHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;
    if (options.user) sdkParams.user = options.user;
    if (options.status) sdkParams.status = options.status;
    if (options.orderType) sdkParams.order_type = options.orderType;

    const result = await (exchangeClient as any).orders.history(options.symbol, sdkParams);
    const orders = result.data;
    const envelope = { data: orders, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: orders.length,
        exchange,
        symbol: options.symbol,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} Order History (${exchange})`);
        prettyField('Records', orders.length);
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} Order History (${exchange}) — ${orders.length} records`);
      if (orders.length === 0) {
        prettyDim('No orders found.');
      } else {
        const preview = orders.slice(0, 20);
        const rows = preview.map((o: any) => [
          o.timestamp,
          o.side === 'B' ? 'BUY' : 'SELL',
          o.price,
          o.size,
          o.status ?? '',
          o.user ?? '',
        ]);
        prettyTable(['Timestamp', 'Side', 'Price', 'Size', 'Status', 'User'], rows);
        if (orders.length > 20) prettyDim(`... and ${orders.length - 20} more`);
        if (result.nextCursor) prettyDim('More data available (use --cursor to paginate)');
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
  out?: string;
  apiKey?: string;
  format: string;
}

export async function ordersFlowCommand(options: OrdersFlowOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.interval) sdkParams.interval = options.interval;

    const result = await (exchangeClient as any).orders.flow(options.symbol, sdkParams);
    const data = result.data;
    const envelope = { data, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: data.length,
        exchange,
        symbol: options.symbol,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} Order Flow (${exchange})`);
        prettyField('Records', data.length);
        prettyField('Written to', options.out);
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} Order Flow (${exchange}) — ${data.length} records`);
      if (data.length === 0) {
        prettyDim('No order flow data found.');
      } else {
        outputJson(envelope);
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
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const exchangeClient = getExchangeClient(client, exchange);
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;
    if (options.user) sdkParams.user = options.user;
    if (options.triggered !== undefined) sdkParams.triggered = options.triggered === 'true';

    const result = await (exchangeClient as any).orders.tpsl(options.symbol, sdkParams);
    const orders = result.data;
    const envelope = { data: orders, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: orders.length,
        exchange,
        symbol: options.symbol,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${options.symbol} TP/SL Orders (${exchange})`);
        prettyField('Records', orders.length);
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${options.symbol} TP/SL Orders (${exchange}) — ${orders.length} records`);
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
        if (result.nextCursor) prettyDim('More data available (use --cursor to paginate)');
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
