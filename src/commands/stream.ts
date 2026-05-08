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
  outputJson,
  prettyDim,
} from '../lib/output.js';

const DEFAULT_WS_URL = 'wss://api.0xarchive.io/ws';

interface StreamOptions {
  exchange?: string;
  apiKey?: string;
  format: string;
  durationMs?: string;
  url?: string;
}

// Allow-listed channels for the dedicated `oxa stream <verb>` commands.
// The `oxa stream subscribe <channel>` form bypasses this list and forwards
// any channel name to the server (used for spot_orderbook, spot_trades,
// spot_l4_diffs, spot_l4_orders, spot_twap and any future channels).
type Channel =
  | 'liquidations'
  | 'hip3_liquidations'
  | 'trades'
  | 'orderbook'
  | 'spot_orderbook'
  | 'spot_trades'
  | 'spot_l4_diffs'
  | 'spot_l4_orders'
  | 'spot_twap';

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
  'lighter_candles',
  'lighter_open_interest',
  'lighter_funding',
  'lighter_l3_orderbook',
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

function resolveChannel(rawChannel: string, exchange?: string): Channel {
  const ch = rawChannel.toLowerCase();
  if (ch === 'liquidations') {
    if (exchange === 'hip3') return 'hip3_liquidations';
    return 'liquidations';
  }
  if (ch === 'hip3_liquidations') return 'hip3_liquidations';
  if (ch === 'trades') {
    if (exchange === 'spot') return 'spot_trades';
    return 'trades';
  }
  if (ch === 'orderbook') {
    if (exchange === 'spot') return 'spot_orderbook';
    return 'orderbook';
  }
  if (ch.startsWith('spot_')) return ch as Channel;
  exitError(`Unknown stream channel "${rawChannel}".`, EXIT.VALIDATION);
}

function parseDuration(raw?: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    exitError(`Invalid --duration-ms "${raw}". Must be a positive number.`, EXIT.VALIDATION);
  }
  return n;
}

async function streamChannel(
  rawChannel: string,
  symbol: string,
  options: StreamOptions,
  preResolved?: string,
): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const channel = preResolved ?? resolveChannel(rawChannel, options.exchange);
  const durationMs = parseDuration(options.durationMs);

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
  let timer: NodeJS.Timeout | undefined;

  ws.addEventListener('open', () => {
    opened = true;
    ws.send(JSON.stringify({ op: 'subscribe', channel, symbol }));
    if (format === 'pretty') {
      prettyDim(`subscribed: channel=${channel} symbol=${symbol}`);
    }
    if (durationMs !== undefined) {
      timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, durationMs);
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
      exitError(`stream error: ${payload.message ?? 'unknown error'}`, EXIT.NETWORK);
    }

    // Pass through data and historical_data envelopes as NDJSON.
    if (format === 'pretty') {
      const ts = payload?.data?.timestamp ?? payload?.timestamp ?? '';
      const ch = payload?.channel ?? channel;
      process.stdout.write(`[${ch}] ${ts} ${JSON.stringify(payload?.data ?? payload)}\n`);
    } else {
      outputJson(payload);
    }
  });

  ws.addEventListener('error', (event: Event) => {
    const message = (event as any)?.message ?? 'WebSocket error';
    exitError(`websocket error: ${message}`, EXIT.NETWORK);
  });

  ws.addEventListener('close', (event: any) => {
    if (timer) clearTimeout(timer);
    if (!opened) {
      exitError(
        `websocket closed before open (code=${event.code}). Check the URL and your API key.`,
        EXIT.NETWORK,
      );
    }
    process.exit(EXIT.SUCCESS);
  });

  const shutdown = () => {
    try {
      ws.close();
    } catch {
      // ignore
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export async function streamLiquidationsCommand(symbol: string, options: StreamOptions): Promise<void> {
  return streamChannel('liquidations', symbol, options);
}

export async function streamTradesCommand(symbol: string, options: StreamOptions): Promise<void> {
  return streamChannel('trades', symbol, options);
}

export async function streamOrderbookCommand(symbol: string, options: StreamOptions): Promise<void> {
  return streamChannel('orderbook', symbol, options);
}

export async function streamGenericCommand(
  channel: string,
  symbol: string,
  options: StreamOptions,
): Promise<void> {
  const ch = String(channel).toLowerCase();
  if (!VALID_GENERIC_CHANNELS.has(ch)) {
    exitError(
      `Unknown stream channel "${channel}". Valid channels: ${Array.from(VALID_GENERIC_CHANNELS).sort().join(', ')}.`,
      EXIT.VALIDATION,
    );
  }
  return streamChannel(ch, symbol, options, ch);
}
