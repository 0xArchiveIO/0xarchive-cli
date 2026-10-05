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
import { exitWsError } from '../lib/errors.js';
import { API_VERSION } from '../lib/http.js';
import { installedWsChannelCapabilities, wsChannelCapabilities, type WsChannelCapability } from '../lib/sdk.js';

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
  | 'hip4_trades'
  | 'lighter_trades'
  | 'rh_lighter_trades'
  | 'spot_trades'
  | 'orderbook'
  | 'hip3_orderbook'
  | 'hip4_orderbook'
  | 'lighter_orderbook'
  | 'rh_lighter_orderbook'
  | 'spot_orderbook';

/**
 * Where the data of a replay-only channel is served. Hints only: which
 * channels stream live is the SDK's channel table (WS_CHANNEL_CAPABILITIES),
 * which mirrors `/v1/capabilities`.
 */
export const REPLAY_ONLY_HINTS: Readonly<Record<string, string>> = {
  candles: 'Use `oxa candles history --exchange hyperliquid` or `oxa stream replay candles <symbol>`.',
  hip3_candles: 'Use `oxa candles history --exchange hip3` or `oxa stream replay hip3_candles <symbol>`.',
  hip4_orderbook:
    'Use `oxa orderbook get --exchange hip4 --symbol <coin>` for the current book or ' +
    '`oxa stream replay hip4_orderbook <coin>` for stored books.',
  hip4_open_interest:
    'Use `oxa oi current --exchange hip4 --symbol <coin>` for current open interest or ' +
    '`oxa stream replay hip4_open_interest <coin>` for stored values.',
  lighter_candles: 'Use `oxa candles history --exchange lighter` for candle history.',
  lighter_l3_orderbook:
    'Use `oxa lighter l3 get` for the current L3 book or `oxa lighter l3 history` for stored snapshots.',
  rh_lighter_candles: 'Use `oxa candles history --exchange rh-lighter` for candle history.',
};

/**
 * Where the data of a channel that neither streams nor replays is served.
 * The SDK's channel table lists it with neither mode.
 */
export const REST_ONLY_HINTS: Readonly<Record<string, string>> = {
  spot_twap: 'Use `oxa spot twap history <symbol> --start ... --end ...` for Spot TWAP statuses.',
};

/**
 * Exit with a validation error unless the SDK's channel table marks the
 * channel live. Unknown channels list the live ones.
 */
export function requireLiveChannel(channel: string): void {
  const table = wsChannelCapabilities();
  const capability = Object.hasOwn(table, channel) ? table[channel] : undefined;
  if (!capability) {
    exitError(`Unknown stream channel "${channel}". Live channels: ${liveChannels().join(', ')}.`, EXIT.VALIDATION);
  }
  refuseUnlessLive(channel, capability);
}

/**
 * The same check for the channel a dedicated verb resolved to. On an SDK
 * release older than the floor, which has no channel table, the verb streams
 * as before.
 */
function requireLiveVerbChannel(channel: string): void {
  const table = installedWsChannelCapabilities();
  if (table && Object.hasOwn(table, channel)) refuseUnlessLive(channel, table[channel]);
}

function refuseUnlessLive(channel: string, capability: WsChannelCapability): void {
  if (capability.live) return;
  if (!capability.replay) {
    const hint = Object.hasOwn(REST_ONLY_HINTS, channel) ? ` ${REST_ONLY_HINTS[channel]}` : '';
    exitError(
      `${channel} is served over REST only; the API neither streams nor replays it.${hint}`,
      EXIT.VALIDATION,
    );
  }
  const hint = Object.hasOwn(REPLAY_ONLY_HINTS, channel)
    ? ` ${REPLAY_ONLY_HINTS[channel]}`
    : ` Use \`oxa stream replay ${channel} <symbol> --start ... --end ...\` for stored data.`;
  exitError(
    `${channel} supports historical replay only; live subscriptions are not available on this channel.${hint}`,
    EXIT.VALIDATION,
  );
}

/** The channels the SDK's table marks as live, sorted. */
export function liveChannels(): string[] {
  const table = wsChannelCapabilities();
  return Object.keys(table)
    .filter((channel) => table[channel].live)
    .sort();
}

/** Add the API version the CLI is written against to a WebSocket URL. */
export function wsUrlWithVersion(baseUrl: string): string {
  if (/[?&]version=/.test(baseUrl)) return baseUrl;
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}version=${API_VERSION}`;
}

// A connection that falls behind a Lighter live channel (either deployment)
// gets a "Dropped ~N live <channel> messages ..." error notice while the
// subscription keeps running: books and stats are full states, and trades are
// independent rows, so the stream stays usable. The CLI reports these as
// warnings and keeps streaming. The server's "Stopped the <channel> stream ..."
// notice ends the subscription and, like every other server error, still exits.
export function isLighterDropNotice(channel: string, message: string): boolean {
  return (
    (channel.startsWith('lighter_') || channel.startsWith('rh_lighter_')) &&
    message.startsWith('Dropped ~')
  );
}

// The Lighter book channels send the newest full book at most once per
// interval, set with --interval-ms. No other channel takes an interval.
export const LIGHTER_BOOK_CHANNELS: readonly string[] = ['lighter_orderbook', 'rh_lighter_orderbook'];
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
    hip4: 'hip4_trades',
    lighter: 'lighter_trades',
    'rh-lighter': 'rh_lighter_trades',
    spot: 'spot_trades',
  },
  orderbook: {
    hyperliquid: 'orderbook',
    hip3: 'hip3_orderbook',
    hip4: 'hip4_orderbook',
    lighter: 'lighter_orderbook',
    'rh-lighter': 'rh_lighter_orderbook',
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
 * Validate `--interval-ms` for the resolved channel. Only the Lighter book
 * channels (lighter_orderbook, rh_lighter_orderbook) take an interval; the
 * server applies the same bounds.
 */
export function parseIntervalMs(raw: string | undefined, channel: string): number | undefined {
  if (raw === undefined) return undefined;
  if (!LIGHTER_BOOK_CHANNELS.includes(channel)) {
    exitError(
      '--interval-ms is only supported on lighter_orderbook and rh_lighter_orderbook ' +
        '(`oxa stream orderbook <symbol> --exchange lighter|rh-lighter` or ' +
        '`oxa stream subscribe lighter_orderbook|rh_lighter_orderbook <symbol>`).',
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
        `${LIGHTER_BOOK_INTERVAL_MAX_MS} for ${channel} (got ${raw}). Leave it out for one book a second.`,
      EXIT.VALIDATION,
    );
  }
  return n;
}

/**
 * HIP-4 WebSocket channels name coins in their on-chain form (`#0`). The CLI
 * takes bare numerics everywhere else, so `0` and `%230` become `#0` here.
 */
export function wsSymbol(channel: string, symbol: string): string {
  if (!channel.startsWith('hip4_')) return symbol;
  const trimmed = String(symbol).trim();
  const digits = trimmed.replace(/^(#|%23)/i, '');
  return /^\d+$/.test(digits) ? `#${digits}` : trimmed;
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
  symbol = wsSymbol(channel, symbol);
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
  const separator = baseUrl.includes('?') ? '&' : '?';
  const url = wsUrlWithVersion(`${baseUrl}${separator}apiKey=${encodeURIComponent(apiKey)}`);

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
        const warning: Record<string, unknown> = { warning: `stream warning: ${message}`, type: 'lag' };
        if (typeof payload.error_code === 'string') warning.error_code = payload.error_code;
        process.stderr.write(JSON.stringify(warning) + '\n');
        return;
      }
      exitWsError('stream error', payload);
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

// The dedicated verbs check the channel they resolve to against the SDK's
// table too, so `oxa stream orderbook --exchange hip4` is refused with a hint
// rather than waiting on a channel that does not stream.

export async function streamLiquidationsCommand(symbol: string, options: StreamOptions): Promise<void> {
  const channel = resolveChannel('liquidations', options.exchange);
  requireLiveVerbChannel(channel);
  return streamChannel(channel, symbol, options);
}

export async function streamTradesCommand(symbol: string, options: StreamOptions): Promise<void> {
  const channel = resolveChannel('trades', options.exchange);
  requireLiveVerbChannel(channel);
  return streamChannel(channel, symbol, options);
}

export async function streamOrderbookCommand(symbol: string, options: StreamOptions): Promise<void> {
  const channel = resolveChannel('orderbook', options.exchange);
  requireLiveVerbChannel(channel);
  return streamChannel(channel, symbol, options);
}

export async function streamGenericCommand(
  channel: string,
  symbol: string,
  options: StreamOptions,
): Promise<void> {
  const ch = String(channel).toLowerCase();
  if (!Object.hasOwn(wsChannelCapabilities(), ch)) {
    exitError(`Unknown stream channel "${channel}". Live channels: ${liveChannels().join(', ')}.`, EXIT.VALIDATION);
  }
  requireLiveChannel(ch);
  return streamChannel(ch, symbol, options);
}
