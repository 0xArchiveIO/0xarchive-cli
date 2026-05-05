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

type Channel = 'liquidations' | 'hip3_liquidations' | 'trades' | 'orderbook';

function resolveChannel(rawChannel: string, exchange?: string): Channel {
  const ch = rawChannel.toLowerCase();
  if (ch === 'liquidations') {
    if (exchange === 'hip3') return 'hip3_liquidations';
    return 'liquidations';
  }
  if (ch === 'hip3_liquidations') return 'hip3_liquidations';
  if (ch === 'trades') return 'trades';
  if (ch === 'orderbook') return 'orderbook';
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
): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const channel = resolveChannel(rawChannel, options.exchange);
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

  ws.addEventListener('close', (event: CloseEvent) => {
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
