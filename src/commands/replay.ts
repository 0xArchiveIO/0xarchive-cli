// `oxa stream replay <channel> <symbol>`: historical WebSocket replay through
// the SDK client (OxArchiveWs.replay). Every server message is written to
// stdout as one JSON record per line (NDJSON) until the replay completes.
//
// Live-only channels are refused before a socket is opened. For the channels
// the SDK refuses (full-depth L2, HIP-3, HIP-4, and Spot L4) the message is the
// SDK's own; Spot, ticker, and all_tickers are refused by the CLI.

import { OxArchiveWs } from '@0xarchive/sdk';
import { resolveApiKey } from '../lib/client.js';
import { validateFormat, EXIT, exitError, prettyDim } from '../lib/output.js';
import { parseTimestamp, validateCandleInterval } from '../lib/time.js';
import { wsSymbol } from './stream.js';

const DEFAULT_WS_URL = 'wss://api.0xarchive.io/ws';

/** Channels the API replays. */
export const REPLAY_CHANNELS: readonly string[] = [
  'orderbook',
  'trades',
  'candles',
  'liquidations',
  'open_interest',
  'funding',
  'l4_diffs',
  'l4_orders',
  'hip3_orderbook',
  'hip3_trades',
  'hip3_candles',
  'hip3_open_interest',
  'hip3_funding',
  'hip3_liquidations',
  'hip4_orderbook',
  'hip4_trades',
  'hip4_open_interest',
  'lighter_orderbook',
  'lighter_trades',
  'lighter_candles',
  'lighter_open_interest',
  'lighter_funding',
  'lighter_l3_orderbook',
  'rh_lighter_orderbook',
  'rh_lighter_trades',
  'rh_lighter_candles',
  'rh_lighter_open_interest',
  'rh_lighter_funding',
];

/**
 * Live-only channels whose replay the SDK refuses before sending, with the
 * CLI commands that serve their history instead.
 */
export const SDK_LIVE_ONLY_CHANNELS: Readonly<Record<string, string>> = {
  orderbook_full: 'In the CLI: `oxa l2 history` and `oxa l2 diffs`.',
  hip3_orderbook_full: 'In the CLI: `oxa l2 history --exchange hip3` and `oxa l2 diffs --exchange hip3`.',
  hip3_l4_diffs: 'In the CLI: `oxa l4 diffs --exchange hip3`.',
  hip3_l4_orders: 'In the CLI: `oxa orders history --exchange hip3`.',
  hip4_l4_diffs: 'In the CLI: `oxa hip4 l4 diffs <coin>`.',
  hip4_l4_orders: 'In the CLI: `oxa hip4 orders history <coin>`.',
  spot_l4_diffs: 'In the CLI: `oxa spot l4 <symbol> --timestamp <ms>` for the book at a point in time.',
  spot_l4_orders: 'In the CLI: `oxa spot orders <symbol>`.',
};

/** Other live-only channels, with where their history lives instead. */
export const CLI_LIVE_ONLY_CHANNELS: Readonly<Record<string, string>> = {
  spot_orderbook: 'Use `oxa spot orderbook <symbol> --timestamp <ms>` for stored Spot books.',
  spot_trades: 'Use `oxa spot trades <symbol> --start ... --end ...` for Spot trade history.',
  spot_twap: 'Use `oxa spot twap <symbol> --start ... --end ...` for Spot TWAP history.',
  ticker: 'Use `oxa summary` or `oxa prices` for stored prices.',
  all_tickers: 'Use `oxa summary` or `oxa prices` for stored prices.',
};

/** Candle channels take `--interval`; no other replay channel does. */
const CANDLE_CHANNELS: readonly string[] = ['candles', 'hip3_candles', 'lighter_candles', 'rh_lighter_candles'];

interface ReplayOptions {
  start: string;
  end: string;
  speed?: string;
  interval?: string;
  url?: string;
  apiKey?: string;
  format: string;
}

interface ReplayRequest {
  start: number;
  end: number;
  speed?: number;
  interval?: string;
}

function parseSpeed(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) {
    exitError(`--speed must be a positive number, e.g. 10 for ten times real time (got ${raw})`, EXIT.VALIDATION);
  }
  return n;
}

/**
 * Run the SDK's replay validation without a connection. The client is not
 * connected, so a request that passes validation is not sent anywhere; a
 * refused channel throws the SDK's error.
 */
export function sdkReplayRefusal(channel: string, symbol: string, request: ReplayRequest): string | undefined {
  const probe = new OxArchiveWs({ apiKey: 'validation-only', autoReconnect: false });
  try {
    (probe.replay as (channel: string, symbol: string, options: ReplayRequest) => void)(channel, symbol, request);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

function prettyLine(channel: string, message: any): string {
  const type = String(message?.type ?? 'message');
  const time = message?.timestamp ?? '';
  const data = message?.data !== undefined ? ` ${JSON.stringify(message.data)}` : '';
  return `[${message?.channel ?? channel}] ${type} ${time}${data}`.replace(/\s+$/, '');
}

export async function streamReplayCommand(channel: string, symbol: string, options: ReplayOptions): Promise<void> {
  const format = validateFormat(options.format);
  const ch = String(channel).toLowerCase();
  symbol = wsSymbol(ch, symbol);
  const start = parseTimestamp(options.start, 'start');
  const end = parseTimestamp(options.end, 'end');
  if (start >= end) exitError('--start must be before --end', EXIT.VALIDATION);
  const speed = parseSpeed(options.speed);
  let interval: string | undefined;
  if (options.interval !== undefined) {
    if (!CANDLE_CHANNELS.includes(ch)) {
      exitError(`--interval applies to candle channels only (${CANDLE_CHANNELS.join(', ')}).`, EXIT.VALIDATION);
    }
    interval = validateCandleInterval(options.interval);
  }

  if (Object.hasOwn(CLI_LIVE_ONLY_CHANNELS, ch)) {
    exitError(`${ch} is live-only; replay is unavailable. ${CLI_LIVE_ONLY_CHANNELS[ch]}`, EXIT.VALIDATION);
  }
  const liveOnlyHint = Object.hasOwn(SDK_LIVE_ONLY_CHANNELS, ch) ? SDK_LIVE_ONLY_CHANNELS[ch] : undefined;
  if (!REPLAY_CHANNELS.includes(ch) && liveOnlyHint === undefined) {
    exitError(
      `Unknown replay channel "${channel}". Replayable channels: ${[...REPLAY_CHANNELS].sort().join(', ')}.`,
      EXIT.VALIDATION,
    );
  }
  const apiKey = resolveApiKey(options.apiKey);

  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== 'function') {
    exitError(
      'WebSocket replay requires Node.js 22+ (global WebSocket). ' +
        'Upgrade Node, or use the historical REST commands (e.g. `oxa trades fetch`).',
      EXIT.INTERNAL,
    );
  }

  const request: ReplayRequest = { start, end, ...(speed !== undefined ? { speed } : {}), ...(interval ? { interval } : {}) };
  const refusal = sdkReplayRefusal(ch, symbol, request);
  if (refusal !== undefined) {
    exitError(liveOnlyHint ? `${refusal} ${liveOnlyHint}` : refusal, EXIT.VALIDATION);
  }
  if (liveOnlyHint !== undefined) {
    // An SDK older than the floor does not refuse these itself.
    exitError(`${ch} is live-only; replay is unavailable. ${liveOnlyHint}`, EXIT.VALIDATION);
  }

  const ws = new OxArchiveWs({
    apiKey,
    wsUrl: options.url ?? process.env.OXA_WS_URL ?? DEFAULT_WS_URL,
    autoReconnect: false,
  });
  let opened = false;
  let finished = false;

  const finish = (code: number) => {
    finished = true;
    try {
      ws.disconnect();
    } catch {
      // ignore
    }
    process.exit(code);
  };

  const write = (message: any) => {
    if (format === 'pretty') process.stdout.write(prettyLine(ch, message) + '\n');
    else process.stdout.write(JSON.stringify(message) + '\n');
  };

  const onMessage = (message: any) => {
    const type = message?.type;
    if (type === 'pong') return;
    if (type === 'error') {
      finished = true;
      exitError(`replay error: ${String(message.message ?? 'unknown error')}`, EXIT.NETWORK);
    }
    write(message);
    if (type === 'replay_completed' || type === 'replay_stopped') finish(EXIT.SUCCESS);
  };

  const onClose = (code: number) => {
    if (finished) return;
    finished = true;
    if (!opened) {
      exitError(`websocket closed before open (code=${code}). Check the URL and your API key.`, EXIT.NETWORK);
    }
    exitError(`websocket closed before the replay completed (code=${code}).`, EXIT.NETWORK);
  };

  process.on('SIGINT', () => finish(EXIT.SUCCESS));
  process.on('SIGTERM', () => finish(EXIT.SUCCESS));

  try {
    await ws.connect({ onMessage, onClose } as Parameters<OxArchiveWs['connect']>[0]);
  } catch (error) {
    if (finished) return;
    finished = true;
    const reason = error instanceof Error ? error.message : String(error);
    exitError(`${reason}. Check the URL and your API key.`, EXIT.NETWORK);
  }
  opened = true;

  if (format === 'pretty') {
    const speedNote = speed !== undefined ? ` speed=${speed}` : '';
    prettyDim(`replay: channel=${ch} symbol=${symbol} start=${start} end=${end}${speedNote}`);
  }
  (ws.replay as (channel: string, symbol: string, options: ReplayRequest) => void)(ch, symbol, request);
}
