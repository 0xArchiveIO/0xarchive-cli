// `oxa stream replay <channel> <symbol>`: historical WebSocket replay through
// the SDK client (OxArchiveWs.replay). Every server message is written to
// stdout as one JSON record per line (NDJSON) until the replay completes.
//
// Which channels replay is the SDK's channel table (WS_CHANNEL_CAPABILITIES),
// which mirrors `/v1/capabilities`. A channel it does not mark replayable
// (live-only, or served over REST only) is refused before a socket is
// opened. Bulk channels (every L4 channel and the full-depth books) replay as
// an `l4_snapshot` followed by `l4_batch` pages; they ignore `--speed`.

import { OxArchiveWs } from '@0xarchive/sdk';
import { resolveApiKey } from '../lib/client.js';
import { validateFormat, EXIT, exitError, prettyDim } from '../lib/output.js';
import { exitWsError } from '../lib/errors.js';
import { parseTimestamp, validateCandleInterval } from '../lib/time.js';
import { wsChannelCapabilities } from '../lib/sdk.js';
import { wsSymbol } from './stream.js';

const DEFAULT_WS_URL = 'wss://api.0xarchive.io/ws';

/**
 * Where the history of a channel that does not replay is served instead.
 * Hints only: the decision to refuse comes from the SDK's channel table.
 */
export const LIVE_ONLY_HINTS: Readonly<Record<string, string>> = {
  spot_orderbook: 'Use `oxa orderbook history --exchange spot` for stored Spot books.',
  spot_trades: 'Use `oxa trades history --exchange spot --start ... --end ...` for Spot trade history.',
  spot_twap: 'Use `oxa spot twap history <symbol> --start ... --end ...` for Spot TWAP history.',
  ticker: 'Use `oxa summary get` or `oxa prices history` for stored prices.',
  all_tickers: 'Use `oxa summary get` or `oxa prices history` for stored prices.',
};

/** The channels the SDK's table marks as replayable, sorted. */
export function replayChannels(): string[] {
  const table = wsChannelCapabilities();
  return Object.keys(table)
    .filter((channel) => table[channel].replay)
    .sort();
}

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

function prettyLine(channel: string, message: any): string {
  const type = String(message?.type ?? 'message');
  const time = message?.timestamp ?? '';
  let data = message?.data !== undefined ? ` ${JSON.stringify(message.data)}` : '';
  // Bulk replay pages hold thousands of events and a snapshot holds the whole
  // book; the summary line counts them instead of printing them.
  if (type === 'l4_batch' && Array.isArray(message?.data)) {
    data = ` ${message.data.length} events`;
  } else if (type === 'l4_snapshot' && message?.data && typeof message.data === 'object') {
    const book = message.data as { bids?: unknown; asks?: unknown };
    const count = (side: unknown) => (Array.isArray(side) ? side.length : 0);
    const block = message.last_block_number !== undefined ? ` block=${message.last_block_number}` : '';
    data = `${block} bids=${count(book.bids)} asks=${count(book.asks)}`;
  }
  const head = time === '' ? `[${message?.channel ?? channel}] ${type}` : `[${message?.channel ?? channel}] ${type} ${time}`;
  return `${head}${data}`.replace(/\s+$/, '');
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

  const table = wsChannelCapabilities();
  const capability = Object.hasOwn(table, ch) ? table[ch] : undefined;
  if (!capability) {
    exitError(`Unknown replay channel "${channel}". Replayable channels: ${replayChannels().join(', ')}.`, EXIT.VALIDATION);
  }
  const hint = Object.hasOwn(LIVE_ONLY_HINTS, ch) ? ` ${LIVE_ONLY_HINTS[ch]}` : '';
  if (!capability.replay) {
    const reason = capability.live
      ? 'is live only; the API does not replay it'
      : 'is served over REST only; the API neither streams nor replays it';
    exitError(`${ch} ${reason}.${hint}`, EXIT.VALIDATION);
  }
  const apiKey = resolveApiKey(options.apiKey);

  const request: ReplayRequest = { start, end, ...(speed !== undefined ? { speed } : {}), ...(interval ? { interval } : {}) };

  // The SDK connects with the API version (`version=`) it parses.
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
      exitWsError('replay error', message);
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
    const speedNote = capability.bulkReplay ? ' bulk (speed ignored)' : speed !== undefined ? ` speed=${speed}` : '';
    prettyDim(`replay: channel=${ch} symbol=${symbol} start=${start} end=${end}${speedNote}`);
  }
  try {
    // The SDK checks the request against the same channel table before it
    // sends; a refusal here ends the run like the checks above.
    (ws.replay as (channel: string, symbol: string, options: ReplayRequest) => void)(ch, symbol, request);
  } catch (error) {
    finished = true;
    exitError(`${error instanceof Error ? error.message : String(error)}${hint}`, EXIT.VALIDATION);
  }
}
