// Hyperliquid Spot command surface. Maps `oxa spot <verb> <symbol>` to the
// `client.spot.*` SDK resource. Symbols are dashed canonical (HYPE-USDC,
// PURR-USDC); the server resolves dashed to wire format internally.
//
// Spot has no funding, open interest, liquidations, or candles by design
// (those are perpetual constructs). The CLI intentionally omits those verbs.
//
// Coverage: trades from 2025-03-22 (S3 backfill); orderbook, L4, TWAP live
// from 2026-05-05.

import {
  resolveApiKey,
  createClient,
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
import { parseTimestamp, parseLimit, parsePositiveInt } from '../lib/time.js';
import { writeOutputFile } from '../lib/file.js';

interface BaseFormatOpts {
  apiKey?: string;
  format: string;
}

// ── oxa spot pairs ─────────────────────────────────────────────────────────

export async function spotPairsList(options: BaseFormatOpts): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const pairs = await client.spot.pairs.list();

    if (format === 'pretty') {
      prettyHeader(`Spot Pairs (hyperliquid) — ${pairs.length} total`);
      if (pairs.length === 0) {
        prettyDim('No pairs found.');
      } else {
        const rows = pairs.map((p: any) => [
          p.symbol ?? '—',
          p.baseAsset ?? '—',
          p.quoteAsset ?? '—',
          p.wireSymbol ?? '—',
          p.markPrice != null ? String(p.markPrice) : '—',
          p.isActive === false ? 'inactive' : 'active',
        ]);
        prettyTable(['Symbol', 'Base', 'Quote', 'Wire', 'Mark Price', 'Status'], rows);
      }
      process.stdout.write('\n');
    } else {
      outputJson(pairs);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa spot pair <symbol> ─────────────────────────────────────────────────

export async function spotPairGet(symbol: string, options: BaseFormatOpts): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const pair = await client.spot.pairs.get(symbol);

    if (format === 'pretty') {
      prettyHeader(`${symbol} Pair (spot)`);
      prettyField('Symbol', (pair as any).symbol);
      prettyField('Base asset', (pair as any).baseAsset);
      prettyField('Quote asset', (pair as any).quoteAsset);
      prettyField('Wire symbol', (pair as any).wireSymbol);
      prettyField('Asset index', (pair as any).assetIndex);
      prettyField('Size decimals', (pair as any).szDecimals);
      prettyField('Price decimals', (pair as any).pxDecimals);
      prettyField('Mark price', (pair as any).markPrice);
      prettyField('Mid price', (pair as any).midPrice);
      prettyField('Latest timestamp', (pair as any).latestTimestamp);
      prettyField('Status', (pair as any).isActive === false ? 'inactive' : 'active');
      process.stdout.write('\n');
    } else {
      outputJson(pair);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa spot orderbook <symbol> ────────────────────────────────────────────

export async function spotOrderbookGet(
  symbol: string,
  options: BaseFormatOpts & { depth?: string; timestamp?: string },
): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const depth = parsePositiveInt(options.depth, 'depth');
  const timestamp = parsePositiveInt(options.timestamp, 'timestamp');
  const client = createClient(apiKey);

  try {
    const orderbook = await client.spot.orderbook.get(symbol, { depth, timestamp });

    if (format === 'pretty') {
      prettyHeader(`${symbol} Orderbook (spot)`);
      prettyField('Timestamp', (orderbook as any).timestamp);
      prettyField('Mid Price', (orderbook as any).midPrice);
      prettyField('Spread', (orderbook as any).spread);
      prettyField('Spread (bps)', (orderbook as any).spreadBps);

      if ((orderbook as any).asks?.length > 0) {
        process.stdout.write('\n');
        prettyDim(`Asks (${(orderbook as any).asks.length} levels)`);
        const askRows = (orderbook as any).asks
          .slice(0, 10)
          .reverse()
          .map((l: any) => [l.px, l.sz, String(l.n)]);
        prettyTable(['Price', 'Size', 'Orders'], askRows);
      }

      if ((orderbook as any).bids?.length > 0) {
        process.stdout.write('\n');
        prettyDim(`Bids (${(orderbook as any).bids.length} levels)`);
        const bidRows = (orderbook as any).bids
          .slice(0, 10)
          .map((l: any) => [l.px, l.sz, String(l.n)]);
        prettyTable(['Price', 'Size', 'Orders'], bidRows);
      }
      process.stdout.write('\n');
    } else {
      outputJson(orderbook);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa spot trades <symbol> ───────────────────────────────────────────────

export async function spotTrades(
  symbol: string,
  options: BaseFormatOpts & {
    start?: string;
    end?: string;
    user?: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);

  const hasStart = options.start !== undefined;
  const hasEnd = options.end !== undefined;

  if (hasStart !== hasEnd) {
    exitError(
      'Both --start and --end are required when specifying a time range.',
      EXIT.VALIDATION,
    );
  }

  if (!hasStart && !hasEnd) {
    exitError(
      'Spot trades require a time range. Provide --start and --end.\n' +
        'Example: oxa spot trades HYPE-USDC ' +
        '--start 2026-05-01T00:00:00Z --end 2026-05-01T01:00:00Z',
      EXIT.VALIDATION,
    );
  }

  const start = parseTimestamp(options.start!, 'start');
  const end = parseTimestamp(options.end!, 'end');

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;
    // The /spot/trades endpoint accepts `user` as a server-side filter.
    // The SDK forwards arbitrary keys via the params object as querystring.
    if (options.user) sdkParams.user = options.user;

    const result = await client.spot.trades.list(symbol, sdkParams as any);
    const trades = result.data;
    const envelope = { data: trades, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: trades.length,
        exchange: 'spot',
        symbol,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${symbol} Trades (spot)`);
        prettyField('Records', trades.length);
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${symbol} Trades (spot) — ${trades.length} records`);
      if (trades.length === 0) {
        prettyDim('No trades found.');
      } else {
        const preview = trades.slice(0, 20);
        const rows = preview.map((t: any) => [
          t.timestamp,
          t.side === 'B' ? 'BUY' : 'SELL',
          t.price,
          t.size,
        ]);
        prettyTable(['Timestamp', 'Side', 'Price', 'Size'], rows);
        if (trades.length > 20) prettyDim(`... and ${trades.length - 20} more`);
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

// ── oxa spot l4 <symbol> ───────────────────────────────────────────────────

export async function spotL4Get(
  symbol: string,
  options: BaseFormatOpts & { timestamp?: string; depth?: string },
): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const depth = parsePositiveInt(options.depth, 'depth');
  const client = createClient(apiKey);

  try {
    const sdkParams: Record<string, unknown> = {};
    if (options.timestamp) sdkParams.timestamp = parseTimestamp(options.timestamp, 'timestamp');
    if (depth) sdkParams.depth = depth;

    const data = await client.spot.l4Orderbook.get(symbol, sdkParams as any);

    if (format === 'pretty') {
      prettyHeader(`${symbol} L4 Orderbook (spot)`);
      if ((data as any).timestamp) prettyField('Timestamp', (data as any).timestamp);
      if ((data as any).asks) prettyField('Ask levels', (data as any).asks.length);
      if ((data as any).bids) prettyField('Bid levels', (data as any).bids.length);
      process.stdout.write('\n');
    } else {
      outputJson(data);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa spot orders <symbol> ───────────────────────────────────────────────

export async function spotOrdersHistory(
  symbol: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    user?: string;
    status?: string;
    orderType?: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;
    if (options.user) sdkParams.user = options.user;
    if (options.status) sdkParams.status = options.status;
    if (options.orderType) sdkParams.order_type = options.orderType;

    const result = await client.spot.orders.history(symbol, sdkParams as any);
    const orders = result.data;
    const envelope = { data: orders, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: orders.length,
        exchange: 'spot',
        symbol,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${symbol} Order History (spot)`);
        prettyField('Records', orders.length);
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${symbol} Order History (spot) — ${orders.length} records`);
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

// ── oxa spot twap <symbol> ─────────────────────────────────────────────────

export async function spotTwapBySymbol(
  symbol: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;

    const result = await client.spot.twap.bySymbol(symbol, sdkParams as any);
    const statuses = result.data;
    const envelope = { data: statuses, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: statuses.length,
        exchange: 'spot',
        symbol,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`${symbol} TWAP Statuses (spot)`);
        prettyField('Records', statuses.length);
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${symbol} TWAP Statuses (spot) — ${statuses.length} records`);
      if (statuses.length === 0) {
        prettyDim('No TWAP statuses found.');
      } else {
        const preview = statuses.slice(0, 20);
        const rows = preview.map((s: any) => [
          s.timestamp,
          s.coin ?? '—',
          s.side === 'B' ? 'BUY' : s.side === 'A' ? 'SELL' : '—',
          s.status ?? '—',
          s.userAddress ?? '—',
          String(s.twapId ?? '—'),
        ]);
        prettyTable(['Timestamp', 'Coin', 'Side', 'Status', 'User', 'TWAP ID'], rows);
        if (statuses.length > 20) prettyDim(`... and ${statuses.length - 20} more`);
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

// ── oxa spot twap-user <user> ──────────────────────────────────────────────

export async function spotTwapByUser(
  user: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  const limit = parseLimit(options.limit);

  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const sdkParams: Record<string, unknown> = { start, end };
    if (limit) sdkParams.limit = limit;
    if (options.cursor) sdkParams.cursor = options.cursor;

    const result = await client.spot.twap.byUser(user, sdkParams as any);
    const statuses = result.data;
    const envelope = { data: statuses, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
      const summary = {
        written_to: options.out,
        records: statuses.length,
        exchange: 'spot',
        user,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      };
      if (format === 'pretty') {
        prettyHeader(`User TWAP Statuses (spot)`);
        prettyField('User', user);
        prettyField('Records', statuses.length);
        prettyField('Written to', options.out);
        prettyField('Has more', result.nextCursor ? 'yes' : 'no');
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`User TWAP Statuses (spot) — ${statuses.length} records`);
      prettyField('User', user);
      if (statuses.length === 0) {
        prettyDim('No TWAP statuses found.');
      } else {
        const preview = statuses.slice(0, 20);
        const rows = preview.map((s: any) => [
          s.timestamp,
          s.coin ?? '—',
          s.side === 'B' ? 'BUY' : s.side === 'A' ? 'SELL' : '—',
          s.status ?? '—',
          String(s.twapId ?? '—'),
        ]);
        prettyTable(['Timestamp', 'Coin', 'Side', 'Status', 'TWAP ID'], rows);
        if (statuses.length > 20) prettyDim(`... and ${statuses.length - 20} more`);
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

// ── oxa spot freshness <symbol> ────────────────────────────────────────────

function formatLag(lagMs: number | undefined | null): string {
  if (lagMs === undefined || lagMs === null) return '—';
  if (lagMs < 1000) return `${lagMs}ms`;
  if (lagMs < 60_000) return `${(lagMs / 1000).toFixed(1)}s`;
  if (lagMs < 3_600_000) return `${(lagMs / 60_000).toFixed(1)}m`;
  return `${(lagMs / 3_600_000).toFixed(1)}h`;
}

export async function spotFreshness(symbol: string, options: BaseFormatOpts): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const freshness = await client.spot.freshness(symbol);

    if (format === 'pretty') {
      prettyHeader(`${symbol} Freshness (spot)`);
      prettyField('Measured at', (freshness as any).measuredAt);
      process.stdout.write('\n');

      const dataTypes: Array<{ name: string; info: { lastUpdated?: string; lagMs?: number } | undefined }> = [
        { name: 'orderbook', info: (freshness as any).orderbook },
        { name: 'trades', info: (freshness as any).trades },
      ];
      // Optional spot-specific data types (forward-compatible)
      if ((freshness as any).l4) {
        dataTypes.push({ name: 'l4', info: (freshness as any).l4 });
      }
      if ((freshness as any).twap) {
        dataTypes.push({ name: 'twap', info: (freshness as any).twap });
      }

      const rows = dataTypes.map((dt) => [
        dt.name,
        dt.info?.lastUpdated ?? '—',
        formatLag(dt.info?.lagMs),
      ]);

      prettyTable(['Data Type', 'Last Updated', 'Lag'], rows);
      process.stdout.write('\n');
    } else {
      outputJson(freshness);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
