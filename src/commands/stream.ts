// Realtime WebSocket streaming. Uses the global `WebSocket` available in
// Node 22+ (the CLI declares engines.node >= 18 but the stream commands
// require >= 22; we surface a clear error if WebSocket isn't available).
//
// Each `oxa stream <channel> <symbol>` command opens a single subscription,
// emits one JSON record per stdout line (NDJSON), and runs until the user
// hits Ctrl-C. JSON mode is the default; `--format pretty` adds a one-line
// human-readable summary per event.

import { resolveApiKey } from '../lib/client.js';
import {
  validateFormat,
  EXIT,
  exitError,
  prettyDim,
} from '../lib/output.js';

const DEFAULT_WS_URL = 'wss://api.0xarchive.io/ws';

interface StreamOptions {
  exchange?: string;
  apiKey?: string;
  format: string;
  durationMs?: string;
  intervalMs?: string;
  url?: string;
}

// Channels the dedicated `oxa stream <verb>` commands can resolve to.
type Channel =
  | 'liquidations'
  | 'hip3_liquidations'
  | 'trades'
  | 'hip3_trades'
  | 'lighter_trades'
  | 'spot_trades'
  | 'orderbook'
  | 'hip3_orderbook'
  | 'lighter_orderbook'
  | 'spot_orderbook';

// Allow-listed channels for `oxa stream subscribe <channel> <symbol>`.
const VALID_GENERIC_CHANNELS: ReadonlySet<string> = new Set([
  'liquidations',
  'hip3_liquidations',
  'trades',
  'orderbook',
  'candles',
  'open_interest',
  'funding',
  'ticker',
  'all_tickers',
  'l4_diffs',
  'l4_orders',
  'hip3_l4_diffs',
  'hip3_l4_orders',
  'lighter_orderbook',
  'lighter_trades',
  'lighter_open_interest',
  'lighter_funding',
  'hip3_orderbook',
  'hip3_trades',
  'hip3_candles',
  'hip3_open_interest',
  'hip3_funding',
  'spot_orderbook',
  'spot_trades',
  'spot_l4_diffs',
  'spot_l4_orders',
  'spot_twap',
]);

// Lighter channels that support historical replay but not live
// subscriptions. They are rejected before a socket is opened, with a pointer
// to the REST command that serves the same data.
export const LIGHTER_REPLAY_ONLY_CHANNELS: Readonly<Record<string, string>> = {
  lighter_candles: 'Use `oxa candles --exchange lighter` for candle history.',
  lighter_l3_orderbook:
    'Use `oxa l3 get` for the current L3 book or `oxa l3 history` for stored snapshots.',
};

// A connection that falls behind a Lighter live channel gets a
// "Dropped ~N live <channel> messages ..." error notice while the subscription
// keeps running: books and stats are full states, and trades are independent
// rows, so the stream stays usable. The CLI reports these as warnings and
// keeps streaming. The server's "Stopped the <channel> stream ..." notice ends
// the subscription and, like every other server error, still exits.
export function isLighterDropNotice(channel: string, message: string): boolean {
  return channel.startsWith('lighter_') && message.startsWith('Dropped ~');
}

// lighter_orderbook sends the newest full book at most once per interval.
export const LIGHTER_BOOK_INTERVAL_MIN_MS = 100;
export const LIGHTER_BOOK_INTERVAL_MAX_MS = 5000;

// Which `--exchange` values each dedicated verb accepts, and the channel each
// one maps to. Omitting `--exchange` means hyperliquid.
const VERB_CHANNELS: Readonly<Record<string, Readonly<Record<string, Channel>>>> = {
  liquidations: {
    hyperliquid: 'liquidations',
    hip3: 'hip3_liquidations',
  },
  trades: {
    hyperliquid: 'trades',
    hip3: 'hip3_trades',
    lighter: 'lighter_trades',
    spot: 'spot_trades',
  },
  orderbook: {
    hyperliquid: 'orderbook',
    hip3: 'hip3_orderbook',
    lighter: 'lighter_orderbook',
    spot: 'spot_orderbook',
  },
};

export function resolveChannel(verb: string, exchange?: string): Channel {
  const channels = Object.hasOwn(VERB_CHANNELS, verb) ? VERB_CHANNELS[verb] : undefined;
  if (!channels) {
    exitError(`Unknown stream channel "${verb}".`, EXIT.VALIDATION);
  }
  const ex = (exchange ?? 'hyperliquid').toLowerCase();
  const channel = Object.hasOwn(channels, ex) ? channels[ex] : undefined;
  if (!channel) {
    exitError(
      `Invalid exchange "${exchange}" for \`oxa stream ${verb}\`. Must be one of: ${Object.keys(channels).join(', ')}.`,
      EXIT.VALIDATION,
    );
  }
  return channel;
}

function parseDuration(raw?: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    exitError(`Invalid --duration-ms "${raw}". Must be a positive number.`, EXIT.VALIDATION);
  }
  return n;
}

/**
 * Validate `--interval-ms` for the resolved channel. Only lighter_orderbook
 * takes an interval; the server applies the same bounds.
 */
export function parseIntervalMs(raw: string | undefined, channel: string): number | undefined {
  if (raw === undefined) return undefined;
  if (channel !== 'lighter_orderbook') {
    exitError(
      '--interval-ms is only supported on lighter_orderbook ' +
        '(`oxa stream orderbook <symbol> --exchange lighter` or `oxa stream subscribe lighter_orderbook <symbol>`).',
      EXIT.VALIDATION,
    );
  }
  const n = Number(raw);
  if (
    raw.trim() === '' ||
    !Number.isInteger(n) ||
    n < LIGHTER_BOOK_INTERVAL_MIN_MS ||
    n > LIGHTER_BOOK_INTERVAL_MAX_MS
  ) {
    exitError(
      `--interval-ms must be a whole number between ${LIGHTER_BOOK_INTERVAL_MIN_MS} and ` +
        `${LIGHTER_BOOK_INTERVAL_MAX_MS} for lighter_orderbook (got ${raw}). Leave it out for one book a second.`,
      EXIT.VALIDATION,
    );
  }
  return n;
}

export function buildSubscribeMessage(
  channel: string,
  symbol: string,
  intervalMs?: number,
): Record<string, unknown> {
  const message: Record<string, unknown> = { op: 'subscribe', channel, symbol };
  if (intervalMs !== undefined) message.interval_ms = intervalMs;
  return message;
}

// Best-effort event time for the pretty summary line. Replay rows carry
// `timestamp`; live books and fills carry `time` (fills arrive as an array).
function eventTime(payload: any): string | number {
  const data = payload?.data;
  const first = Array.isArray(data) ? data[0] : data;
  return first?.timestamp ?? first?.time ?? payload?.timestamp ?? '';
}

async function streamChannel(
  channel: string,
  symbol: string,
  options: StreamOptions,
): Promise<void> {
  const format = validateFormat(options.format);
  const durationMs = parseDuration(options.durationMs);
  const intervalMs = parseIntervalMs(options.intervalMs, channel);
  const apiKey = resolveApiKey(options.apiKey);

  if (typeof (globalThis as any).WebSocket !== 'function') {
    exitError(
      'WebSocket streaming requires Node.js 22+ (global WebSocket). ' +
        'Upgrade Node, or use the historical REST endpoints (e.g. `oxa liquidations history`).',
      EXIT.INTERNAL,
    );
  }

  const baseUrl = options.url ?? process.env.OXA_WS_URL ?? DEFAULT_WS_URL;
  const url = `${baseUrl}?apiKey=${encodeURIComponent(apiKey)}`;

  const WS = (globalThis as any).WebSocket as {
    new (url: string): WebSocket;
  };
  const ws = new WS(url);

  let opened = false;
  // Set when the CLI closes the socket itself (--duration-ms or Ctrl-C). The
  // server may end the session without a close handshake, which surfaces as
  // an `error` event followed by a 1006 close; that is a normal stop here.
  let closing = false;
  let timer: NodeJS.Timeout | undefined;

  const closeSocket = () => {
    closing = true;
    try {
      ws.close();
    } catch {
      // ignore
    }
  };

  ws.addEventListener('open', () => {
    opened = true;
    ws.send(JSON.stringify(buildSubscribeMessage(channel, symbol, intervalMs)));
    if (format === 'pretty') {
      const interval = intervalMs !== undefined ? ` interval_ms=${intervalMs}` : '';
      prettyDim(`subscribed: channel=${channel} symbol=${symbol}${interval}`);
    }
    if (durationMs !== undefined) {
      timer = setTimeout(closeSocket, durationMs);
    }
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    let payload: any;
    try {
      payload = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    } catch {
      return;
    }

    if (payload?.type === 'subscribed' || payload?.type === 'unsubscribed' || payload?.type === 'pong') {
      if (format === 'pretty') {
        prettyDim(`${payload.type}${payload.channel ? ` ${payload.channel}` : ''}`);
      }
      return;
    }

    if (payload?.type === 'error') {
      const message = String(payload.message ?? 'unknown error');
      if (isLighterDropNotice(channel, message)) {
        process.stderr.write(JSON.stringify({ warning: `stream warning: ${message}`, type: 'lag' }) + '\n');
        return;
      }
      exitError(`stream error: ${message}`, EXIT.NETWORK);
    }

    // Pass through data and historical_data envelopes, one JSON record per line.
    if (format === 'pretty') {
      const ch = payload?.channel ?? channel;
      process.stdout.write(`[${ch}] ${eventTime(payload)} ${JSON.stringify(payload?.data ?? payload)}\n`);
    } else {
      process.stdout.write(JSON.stringify(payload) + '\n');
    }
  });

  ws.addEventListener('error', (event: Event) => {
    if (closing) return;
    const message = (event as any)?.message ?? 'WebSocket error';
    exitError(`websocket error: ${message}`, EXIT.NETWORK);
  });

  ws.addEventListener('close', (event: any) => {
    if (timer) clearTimeout(timer);
    if (!opened && !closing) {
      exitError(
        `websocket closed before open (code=${event.code}). Check the URL and your API key.`,
        EXIT.NETWORK,
      );
    }
    process.exit(EXIT.SUCCESS);
  });

  process.on('SIGINT', closeSocket);
  process.on('SIGTERM', closeSocket);
}

export async function streamLiquidationsCommand(symbol: string, options: StreamOptions): Promise<void> {
  return streamChannel(resolveChannel('liquidations', options.exchange), symbol, options);
}

export async function streamTradesCommand(symbol: string, options: StreamOptions): Promise<void> {
  return streamChannel(resolveChannel('trades', options.exchange), symbol, options);
}

export async function streamOrderbookCommand(symbol: string, options: StreamOptions): Promise<void> {
  return streamChannel(resolveChannel('orderbook', options.exchange), symbol, options);
}

export async function streamGenericCommand(
  channel: string,
  symbol: string,
  options: StreamOptions,
): Promise<void> {
  const ch = String(channel).toLowerCase();
  if (Object.hasOwn(LIGHTER_REPLAY_ONLY_CHANNELS, ch)) {
    exitError(
      `${ch} supports historical replay only; live subscriptions are not available on this channel. ${LIGHTER_REPLAY_ONLY_CHANNELS[ch]}`,
      EXIT.VALIDATION,
    );
  }
  if (!VALID_GENERIC_CHANNELS.has(ch)) {
    exitError(
      `Unknown stream channel "${channel}". Valid channels: ${Array.from(VALID_GENERIC_CHANNELS).sort().join(', ')}.`,
      EXIT.VALIDATION,
    );
  }
  return streamChannel(ch, symbol, options);
}
