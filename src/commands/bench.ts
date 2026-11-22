// `oxa bench`: measure 0xArchive Stream against Hyperliquid's own public
// WebSocket from your own machine.
//
// It races the two feeds for the same trades, pairs every trade on coin and
// trade id, and reports who delivered it first, by how much, whether the two
// copies are identical, and which trades only one feed delivered (see
// src/lib/bench.ts for the rules). It also times Stream's L4 order book diffs
// from block to arrival, and `--book` rebuilds Stream's L4 book and compares
// it with Hyperliquid's own top 20 price levels.
//
// Output is a readable summary (default) or one JSON document (`--json`).
// The API key is only ever sent to the Stream endpoint; it is never printed.

import { resolveApiKey } from '../lib/client.js';
import { EXIT, exitError, outputJson, prettyHeader, prettyField, prettyDim, validateFormat } from '../lib/output.js';
import { exitCodeForApiError, exitWsError } from '../lib/errors.js';
import {
  BookCheck,
  GRACE_MS,
  L4Ages,
  TradeRace,
  hlTrade,
  type BookCheckSummary,
  type FeedSide,
  type Percentiles,
  type RaceSummary,
} from '../lib/bench.js';
import { probeConnections, readClockBound, type UpgradeAnswer } from '../lib/bench-net.js';

export const BENCH_VERSION = 1;
export const DEFAULT_COINS = ['BTC', 'ETH', 'SOL', 'HYPE'];
export const DURATION_MIN_S = 10;
export const DURATION_MAX_S = 3600;
export const BOOK_SECONDS_MIN = 10;
export const BOOK_SECONDS_MAX = 300;

export const ENDPOINTS = {
  hyperliquid: 'wss://api.hyperliquid.xyz/ws',
  stream: 'wss://stream.0xarchive.io/ws',
} as const;

const STREAM_SUBSCRIBE_GAP_MS = 150; // Stream accepts 10 subscribe ops per second per connection
const STREAM_PING_MS = 20_000;
const HL_PING_MS = 30_000;
const BACKOFF_MAX_MS = 30_000;

export interface BenchOptions {
  coins?: string;
  duration: string;
  l4: boolean;
  book?: boolean;
  bookSeconds: string;
  streamUrl?: string;
  hlUrl?: string;
  apiKey?: string;
  format: string;
  json?: boolean;
}

type Venue = 'hyperliquid';

/** A clock in epoch milliseconds with sub-millisecond steps. */
function makeClock(): () => number {
  const origin = Date.now() - performance.now();
  return () => origin + performance.now();
}

function parseSeconds(raw: string, flag: string, min: number, max: number): number {
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(n) || n < min || n > max) {
    exitError(`Invalid ${flag} "${raw}". Must be a whole number of seconds from ${min} to ${max}.`, EXIT.VALIDATION);
  }
  return n;
}

export function parseCoins(raw?: string): string[] {
  if (raw === undefined) return [...DEFAULT_COINS];
  const coins = [...new Set(raw.split(',').map((c) => c.trim()).filter(Boolean))];
  if (coins.length === 0 || coins.length > 10) {
    exitError('Invalid --coins. Give 1 to 10 comma-separated coins, e.g. BTC,ETH.', EXIT.VALIDATION);
  }
  return coins;
}

/** A `--stream-url` or `--hl-url` value: a ws:// or wss:// URL. */
function parseWsUrl(raw: string, flag: string): string {
  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'ws:' && url.protocol !== 'wss:')) {
    exitError(`Invalid ${flag} "${printableUrl(raw)}". Must be a ws:// or wss:// URL.`, EXIT.VALIDATION);
  }
  return raw;
}

function wsUrlWithKey(url: string, apiKey: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(apiKey)}`;
}

/** A URL as printed: the query string (which can carry a key) is dropped. */
export function printableUrl(url: string): string {
  return url.split('?')[0];
}

/** The part of a WebSocket client the bench uses (Node's built-in one in production). */
export interface BenchSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
}

type SocketCtor = new (url: string) => BenchSocket;

function socketCtor(): SocketCtor {
  const ctor = (globalThis as { WebSocket?: SocketCtor }).WebSocket;
  if (!ctor) {
    exitError(
      `oxa bench needs Node.js 22 or newer (it uses the built-in WebSocket client); this is Node.js ${process.version}.`,
      EXIT.VALIDATION,
    );
  }
  return ctor;
}

interface FeedSpec {
  label: string;
  url: string;
  /** Frames sent after open, in order; `gapMs` apart. */
  subscribe: string[];
  gapMs?: number;
  ping?: { everyMs: number; frame: string };
  onConnect?: (now: number) => void;
  onDisconnect?: (now: number) => void;
  onMessage: (message: any, recv: number) => void;
}

/** One WebSocket feed that reconnects with backoff until stopped. */
class Feed {
  private ws: BenchSocket | null = null;
  private stopped = false;
  private backoff = 1000;
  private timers = new Set<NodeJS.Timeout>();
  private ping: NodeJS.Timeout | undefined;
  errors = 0;

  constructor(
    private readonly spec: FeedSpec,
    private readonly Ctor: SocketCtor,
    private readonly now: () => number,
  ) {}

  start(): void {
    if (this.stopped) return;
    let ws: BenchSocket;
    try {
      ws = new this.Ctor(this.spec.url);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    let connected = false;
    ws.onopen = () => {
      this.spec.subscribe.forEach((frame, i) => {
        this.later(() => ws.readyState === 1 && ws.send(frame), i * (this.spec.gapMs ?? 0));
      });
      this.later(() => {
        if (ws.readyState !== 1 || this.stopped) return;
        connected = true;
        this.backoff = 1000;
        this.spec.onConnect?.(this.now());
      }, Math.max(0, this.spec.subscribe.length - 1) * (this.spec.gapMs ?? 0));
      if (this.spec.ping) {
        const { everyMs, frame } = this.spec.ping;
        this.ping = setInterval(() => ws.readyState === 1 && ws.send(frame), everyMs);
      }
    };
    ws.onmessage = (event) => {
      const recv = this.now();
      if (typeof event.data !== 'string') return;
      let message: any;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this.spec.onMessage(message, recv);
    };
    ws.onerror = () => {
      this.errors += 1;
    };
    ws.onclose = () => {
      if (this.ping) clearInterval(this.ping);
      this.ping = undefined;
      if (connected) this.spec.onDisconnect?.(this.now());
      if (this.ws === ws) this.ws = null;
      this.retry();
    };
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

  private retry(): void {
    if (this.stopped) return;
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
    this.later(() => this.start(), wait);
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (this.ping) clearInterval(this.ping);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
      this.spec.onDisconnect?.(this.now());
    }
  }
}

/** A refused upgrade's message and fields: a JSON error envelope, or plain text. */
function refusal(answer: UpgradeAnswer, apiKey: string): { message: string; errorCode?: string; reason?: string } {
  const scrub = (text: string) => text.replaceAll(apiKey, '***').replaceAll(encodeURIComponent(apiKey), '***').trim();
  try {
    const body = JSON.parse(answer.body) as Record<string, unknown>;
    if (body && typeof body === 'object') {
      const text = (key: string) => (typeof body[key] === 'string' && body[key] !== '' ? (body[key] as string) : undefined);
      return { message: scrub(text('error') ?? text('message') ?? ''), errorCode: text('error_code'), reason: text('reason') };
    }
  } catch {
    // plain text
  }
  return { message: scrub(answer.body) };
}

/**
 * Exit unless Stream accepts the key and lets this account hold `connections`
 * connections at once (two: trades and L4 diffs; one with --no-l4). Runs
 * before any socket of the race opens.
 */
async function preflight(url: string, apiKey: string, connections: number): Promise<void> {
  const answers = await probeConnections(wsUrlWithKey(url, apiKey), connections);
  const index = answers.findIndex((a) => a.status !== 101);
  if (index < 0) return;
  const answer = answers[index];
  const where = printableUrl(url);
  const { message, errorCode, reason } = refusal(answer, apiKey);
  const said = message ? `: ${/[.!?]$/.test(message) ? message : `${message}.`}` : '.';
  if (answer.status === null) {
    exitError(`Could not reach 0xArchive Stream at ${where}. Check your network.`, EXIT.NETWORK);
  }
  const fields = { error_code: errorCode, status: answer.status, reason };
  if (answer.status === 401) {
    exitError(
      `0xArchive Stream refused the API key (HTTP 401) at ${where}${said} Check it with \`oxa auth test\`.`,
      EXIT.AUTH,
      fields,
    );
  }
  if (answer.status === 429 && index > 0) {
    exitError(
      `oxa bench needs ${connections} 0xArchive Stream connections at once (one for trades, one for L4 diffs), ` +
        `and Stream refused connection ${index + 1} at ${where}${said} Close other Stream sessions on this account, ` +
        'or run with --no-l4 to use one connection.',
      exitCodeForApiError(errorCode ?? 'rate_limited', 429),
      { ...fields, error_code: errorCode ?? 'rate_limited' },
    );
  }
  exitError(
    `0xArchive Stream refused the connection (HTTP ${answer.status}) at ${where}${said}`,
    // 402: an account that needs a plan.
    answer.status === 402 && errorCode === undefined ? EXIT.AUTH : exitCodeForApiError(errorCode, answer.status),
    fields,
  );
}

function streamSubscribes(channel: string, coins: string[]): string[] {
  return coins.map((symbol) => JSON.stringify({ op: 'subscribe', channel, symbol }));
}

/** A Stream error message ends the run, unless `soft` handles it. */
type StreamErrorHandler = (message: any) => void;

function streamFeed(
  label: string,
  url: string,
  apiKey: string,
  channel: string,
  coins: string[],
  onData: (message: any, recv: number) => void,
  onError: StreamErrorHandler,
  hooks: Pick<FeedSpec, 'onConnect' | 'onDisconnect'> = {},
): FeedSpec {
  return {
    label,
    url: wsUrlWithKey(url, apiKey),
    subscribe: streamSubscribes(channel, coins),
    gapMs: STREAM_SUBSCRIBE_GAP_MS,
    ping: { everyMs: STREAM_PING_MS, frame: JSON.stringify({ op: 'ping' }) },
    ...hooks,
    onMessage: (message, recv) => {
      if (message?.type === 'error') onError(message);
      else onData(message, recv);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BenchResult {
  v: number;
  tool: 'oxa bench';
  started_at: string;
  ended_at: string;
  duration_s: number;
  host: { node: string; platform: string; clock_bound_ms: number | null; clock_source: string | null };
  endpoints: Record<string, string>;
  races: Partial<Record<Venue, RaceSummary & { venue_feed: string; stream_feed: string }>>;
  l4?: { stream_feed: string; coins: string[]; batches: number; block_to_arrival_ms: Percentiles; unavailable?: string };
  book_check?: { stream_feed: string; venue_feed: string; seconds_per_coin: number; coins: BookCheckSummary[]; unavailable?: string };
  notes: string[];
}

class FatalStreamError extends Error {
  constructor(readonly payload: any) {
    super(String(payload?.message ?? 'stream error'));
  }
}

interface BenchPlan {
  venues: Venue[];
  coins: string[];
  durationS: number;
  bookSeconds: number;
  withL4: boolean;
  withBook: boolean;
  apiKey: string;
  Ctor: SocketCtor;
  urls: { hyperliquid: string; stream: string };
}

/**
 * Check the options and make sure Stream accepts
 * the key. Exits on any problem, before a socket opens.
 */
export async function planBench(options: BenchOptions): Promise<BenchPlan> {
  const venues: Venue[] = ['hyperliquid'];
  const coins = parseCoins(options.coins);
  const durationS = parseSeconds(options.duration ?? '120', '--duration', DURATION_MIN_S, DURATION_MAX_S);
  const bookSeconds = parseSeconds(options.bookSeconds ?? '60', '--book-seconds', BOOK_SECONDS_MIN, BOOK_SECONDS_MAX);
  const withL4 = options.l4 !== false;
  const withBook = options.book === true;
  const apiKey = resolveApiKey(options.apiKey);
  const Ctor = socketCtor();

  const urls = {
    hyperliquid: options.hlUrl === undefined ? ENDPOINTS.hyperliquid : parseWsUrl(options.hlUrl, '--hl-url'),
    stream: options.streamUrl === undefined ? ENDPOINTS.stream : parseWsUrl(options.streamUrl, '--stream-url'),
  };
  // The race holds one Stream connection for trades and one for L4 diffs; the
  // book check runs after them, on one connection.
  await preflight(urls.stream, apiKey, withL4 ? 2 : 1);
  return { venues, coins, durationS, bookSeconds, withL4, withBook, apiKey, Ctor, urls };
}

/** Run the race and the optional checks. Resolves with the result document. */
export async function runBench(options: BenchOptions, progress: (text: string) => void = () => {}): Promise<BenchResult> {
  return executeBench(await planBench(options), progress);
}

async function executeBench(plan: BenchPlan, progress: (text: string) => void): Promise<BenchResult> {
  const { venues, coins, durationS, bookSeconds, withL4, withBook, apiKey, Ctor, urls } = plan;
  const now = makeClock();

  const feeds: Feed[] = [];
  const races: Partial<Record<Venue, TradeRace>> = {};
  const notes: string[] = [];
  let fatal: FatalStreamError | null = null;
  const fail = (payload: any) => {
    fatal ??= new FatalStreamError(payload);
  };
  const hooks = (race: TradeRace, side: FeedSide) => ({
    onConnect: (t: number) => race.markConnect(side, t),
    onDisconnect: (t: number) => race.markDisconnect(side, t),
  });

  if (venues.includes('hyperliquid')) {
    const race = (races.hyperliquid = new TradeRace(coins));
    feeds.push(
      new Feed(
        {
          label: 'Hyperliquid trades',
          url: urls.hyperliquid,
          subscribe: coins.map((coin) => JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin } })),
          ping: { everyMs: HL_PING_MS, frame: JSON.stringify({ method: 'ping' }) },
          ...hooks(race, 'venue'),
          onMessage: (m, recv) => {
            if (m?.channel !== 'trades' || !Array.isArray(m.data)) return;
            for (const t of m.data) race.seen('venue', String(t?.coin), hlTrade(t), recv);
          },
        },
        Ctor,
        now,
      ),
      new Feed(
        streamFeed('Stream trades', urls.stream, apiKey, 'trades', coins, (m, recv) => {
          if (m?.type !== 'data' || m.channel !== 'trades') return;
          for (const t of Array.isArray(m.data) ? m.data : [m.data]) race.seen('stream', String(t?.coin), hlTrade(t), recv);
        }, fail, hooks(race, 'stream')),
        Ctor,
        now,
      ),
    );
  }

  const l4 = withL4 ? new L4Ages() : null;
  let l4Unavailable: string | undefined;
  let l4Feed: Feed | null = null;
  if (l4) {
    l4Feed = new Feed(
      streamFeed('Stream L4 diffs', urls.stream, apiKey, 'l4_diffs', coins, (m, recv) => {
        if (m?.type === 'l4_batch') l4.batch(m.data, recv);
      }, (m) => {
        // A plan without L4 still races trades; the L4 part reports why it is empty.
        l4Unavailable ??= String(m?.message ?? 'L4 diffs are not available');
        l4Feed?.stop();
      }),
      Ctor,
      now,
    );
    feeds.push(l4Feed);
  }

  const startedAt = now();
  for (const feed of feeds) feed.start();
  const raceList = Object.values(races) as TradeRace[];
  const tick = setInterval(() => {
    const t = now();
    for (const race of raceList) race.settle(t);
  }, 1000);

  const stopAll = () => {
    clearInterval(tick);
    for (const feed of feeds) feed.stop();
  };

  try {
    const endAt = startedAt + durationS * 1000;
    let lastNote = startedAt;
    while (now() < endAt && !fatal) {
      await sleep(Math.min(1000, Math.max(1, endAt - now())));
      if (now() - lastNote >= 30_000) {
        lastNote = now();
        const matched = raceList.reduce((n, r) => n + r.summary(startedAt, lastNote).matched, 0);
        progress(`${Math.max(0, Math.round((endAt - lastNote) / 1000))} s left, ${matched.toLocaleString('en-US')} trades matched so far`);
      }
    }
    // The run is over: no new trade opens, and the ones already seen get their
    // full grace period to find a second copy.
    const closedAt = now();
    for (const race of raceList) race.closedAt = closedAt;
    const settleBy = closedAt + GRACE_MS;
    while (!fatal && now() < settleBy && raceList.some((r) => r.waiting > 0)) {
      await sleep(250);
      for (const race of raceList) race.settle(now());
    }
    for (const race of raceList) race.settle(Math.max(now(), settleBy));
    stopAll();
    if (fatal) throw fatal;

    const result: BenchResult = {
      v: BENCH_VERSION,
      tool: 'oxa bench',
      started_at: new Date(startedAt).toISOString(),
      ended_at: new Date(closedAt).toISOString(),
      duration_s: Math.round((closedAt - startedAt) / 100) / 10,
      host: { node: process.version, platform: `${process.platform}-${process.arch}`, clock_bound_ms: null, clock_source: null },
      endpoints: Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, printableUrl(v)])),
      races: {},
      notes,
    };
    if (races.hyperliquid) {
      result.races.hyperliquid = {
        venue_feed: printableUrl(urls.hyperliquid),
        stream_feed: printableUrl(urls.stream),
        ...races.hyperliquid.summary(startedAt, closedAt),
      };
    }
    for (const [venue, summary] of Object.entries(result.races)) {
      const name = VENUE_NAMES[venue as Venue];
      if (summary.connected_share.venue === 0) notes.push(`${name}'s own WebSocket never connected, so nothing was raced on ${name}.`);
      if (summary.connected_share.stream === 0) notes.push(`Stream never connected for ${name}, so nothing was raced on ${name}.`);
    }
    if (l4) {
      result.l4 = { stream_feed: printableUrl(urls.stream), coins, ...l4.summary() };
      if (l4Unavailable) result.l4.unavailable = l4Unavailable;
    }

    if (withBook) {
      progress(`Checking Stream's rebuilt L4 book against Hyperliquid's top 20 levels, ${bookSeconds} s per coin`);
      result.book_check = {
        stream_feed: printableUrl(urls.stream),
        venue_feed: printableUrl(urls.hyperliquid),
        seconds_per_coin: bookSeconds,
        coins: [],
      };
      for (const coin of coins) {
        const outcome = await checkBook(coin, urls, apiKey, bookSeconds, Ctor, now);
        if ('unavailable' in outcome) {
          result.book_check.unavailable = outcome.unavailable;
          break;
        }
        result.book_check.coins.push(outcome.summary);
      }
    }

    const clock = await readClockBound();
    result.host.clock_bound_ms = clock.bound_ms;
    result.host.clock_source = clock.source;
    if (clock.bound_ms === null) {
      notes.push('Block-to-arrival times read this machine\'s clock; its error bound is unknown (no chrony or systemd-timesyncd). Head starts need no clock sync.');
    }
    return result;
  } finally {
    stopAll();
  }
}

async function checkBook(
  coin: string,
  urls: { hyperliquid: string; stream: string },
  apiKey: string,
  seconds: number,
  Ctor: SocketCtor,
  now: () => number,
): Promise<{ summary: BookCheckSummary } | { unavailable: string }> {
  const check = new BookCheck(coin);
  let unavailable: string | undefined;
  const feeds = [
    new Feed(
      streamFeed('Stream L4 book', urls.stream, apiKey, 'l4_diffs', [coin], (m) => {
        if (m?.type === 'l4_snapshot') check.snapshot(m);
        else if (m?.type === 'l4_batch') check.batch(m.data);
      }, (m) => {
        unavailable ??= String(m?.message ?? 'L4 diffs are not available');
      }),
      Ctor,
      now,
    ),
    new Feed(
      {
        label: 'Hyperliquid l2Book',
        url: urls.hyperliquid,
        subscribe: [JSON.stringify({ method: 'subscribe', subscription: { type: 'l2Book', coin } })],
        ping: { everyMs: HL_PING_MS, frame: JSON.stringify({ method: 'ping' }) },
        onMessage: (m) => {
          if (m?.channel === 'l2Book') check.venueBook(m.data);
        },
      },
      Ctor,
      now,
    ),
  ];
  for (const feed of feeds) feed.start();
  const endAt = now() + seconds * 1000;
  while (now() < endAt && unavailable === undefined) await sleep(Math.min(500, Math.max(1, endAt - now())));
  for (const feed of feeds) feed.stop();
  return unavailable !== undefined ? { unavailable } : { summary: check.summary() };
}

// ── Output ────────────────────────────────────────────────────────────────

function count(n: number): string {
  return n.toLocaleString('en-US');
}

function ms(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined) return '-';
  const rounded = Math.round(value);
  return `${signed && rounded > 0 ? '+' : ''}${count(rounded)} ms`;
}

function pct(share: number | null): string {
  if (share === null) return '-';
  // Floor to one decimal so a rounded figure never reads better than the count.
  return `${(Math.floor(share * 1000) / 10).toFixed(1)}%`;
}

function spread(p: Percentiles, signed = false): string {
  return `p50 ${ms(p.p50, signed)}, p90 ${ms(p.p90, signed)}, p99 ${ms(p.p99, signed)}`;
}

const VENUE_NAMES: Record<Venue, string> = { hyperliquid: 'Hyperliquid' };

export function printPretty(result: BenchResult): void {
  const clock = result.host.clock_bound_ms !== null
    ? `clock within ${result.host.clock_bound_ms} ms (${result.host.clock_source})`
    : 'clock bound unknown';
  prettyHeader(`oxa bench: ${result.duration_s} s from this machine, ${clock}`);

  for (const venue of ['hyperliquid'] as Venue[]) {
    const r = result.races[venue];
    if (!r) continue;
    const name = VENUE_NAMES[venue];
    prettyHeader(`${name} trades: ${name}'s WebSocket and 0xArchive Stream (${r.coins.join(', ')})`);
    prettyField('Matched trades', count(r.matched));
    if (r.matched > 0) {
      prettyField('Stream first', `${pct(r.stream_first_share)} (${count(r.stream_first)} of ${count(r.matched)}${r.ties ? `, ${count(r.ties)} tied` : ''})`);
      prettyField('Stream head start', spread(r.lead_ms, true));
      prettyField('Identical payloads', `${pct(r.identical_share)} (${count(r.identical_payloads)} of ${count(r.matched)}: price, size, time, hash)`);
      prettyField(`Block to arrival, ${name}`, spread(r.block_to_arrival_ms.venue));
      prettyField('Block to arrival, Stream', spread(r.block_to_arrival_ms.stream));
    }
    prettyField('Seen on one feed only', `${name} only ${count(r.only_venue)}, Stream only ${count(r.only_stream)}`);
    if (r.late_stream || r.late_venue) {
      prettyField('Arrived late (after 10 s)', `Stream ${count(r.late_stream)}, ${name} ${count(r.late_venue)}`);
    }
    if (r.unattributed) prettyField('Not counted (a feed was down or had just connected)', count(r.unattributed));
    prettyField('Reconnects', `${name} ${count(r.reconnects.venue)}, Stream ${count(r.reconnects.stream)}`);
    prettyField('Connected', `${name} ${pct(r.connected_share.venue)}, Stream ${pct(r.connected_share.stream)} of the run`);
  }
  if (Object.keys(result.races).length > 0) {
    prettyDim('Head start is Hyperliquid\'s receipt time minus Stream\'s on this machine: positive means Stream arrived first.');
  }

  if (result.l4) {
    prettyHeader(`Stream L4 order book diffs (${result.l4.coins.join(', ')})`);
    if (result.l4.unavailable) prettyField('Not measured', result.l4.unavailable);
    else {
      prettyField('Blocks received', count(result.l4.batches));
      prettyField('Block to arrival', spread(result.l4.block_to_arrival_ms));
    }
  }

  if (result.book_check) {
    prettyHeader(`Book check: Stream's rebuilt L4 book against Hyperliquid's top 20 levels`);
    if (result.book_check.unavailable) prettyField('Not measured', result.book_check.unavailable);
    for (const c of result.book_check.coins) {
      const detail = c.mismatch && c.mismatch_sample
        ? `; first difference ${c.mismatch_sample.side === 'B' ? 'bid' : 'ask'} level ${c.mismatch_sample.level + 1}`
        : '';
      prettyField(c.coin, `${count(c.match)} of ${count(c.checks)} books matched${detail}`);
    }
  }

  for (const note of result.notes) prettyDim(note);
  prettyDim('Run with --json for the full result.');
}

export async function benchCommand(options: BenchOptions): Promise<void> {
  const format = options.json ? 'json' : validateFormat(options.format ?? 'pretty');
  const quiet = format === 'json' || !process.stderr.isTTY;
  const progress = (text: string) => {
    if (!quiet) process.stderr.write(`  ${text}\n`);
  };
  const apiKey = resolveApiKey(options.apiKey);
  const plan = await planBench({ ...options, apiKey });
  progress(`Racing 0xArchive Stream against Hyperliquid's own feed for ${plan.durationS} s...`);
  let result: BenchResult;
  try {
    result = await executeBench(plan, progress);
  } catch (error) {
    if (error instanceof FatalStreamError) exitWsError('stream error', error.payload);
    const message = error instanceof Error ? error.message : String(error);
    exitError(message.replaceAll(apiKey, '***'), EXIT.INTERNAL);
  }
  if (format === 'json') outputJson(result);
  else printPretty(result);
  process.exit(EXIT.SUCCESS);
}
