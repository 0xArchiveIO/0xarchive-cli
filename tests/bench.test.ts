// `oxa bench`: the trade race, book check and clock helpers in src/lib/bench.ts,
// and the command's run against fake sockets on fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stream's key check and the clock read go through src/lib/bench-net.ts; the
// same mocks serve the module the command tree imports after vi.resetModules().
const net = vi.hoisted(() => ({ probeConnections: vi.fn(), readClockBound: vi.fn() }));
vi.mock('../src/lib/bench-net.js', () => net);
import {
  BookCheck,
  FORGET_MS,
  GRACE_MS,
  L4Ages,
  L4Book,
  LATE_MS,
  TradeRace,
  WARMUP_MS,
  chronyBoundMs,
  compareLevels,
  fromUnits,
  hlTrade,
  normDecimal,
  percentile,
  timesyncdBoundMs,
  toUnits,
  venueLevels,
} from '../src/lib/bench.js';
import { printPretty, runBench, type BenchResult } from '../src/commands/bench.js';
import { captureIo, lastError, runCli, stderrText, stdoutJson, stdoutText } from './helpers.js';

const trade = (tid: number, time: number, px = '100.5', hash = '0xabc') => ({ tid: String(tid), px, sz: '2', time, hash });

describe('bench helpers', () => {
  it('normalizes decimals the way both feeds print them', () => {
    expect(normDecimal('84016.0')).toBe('84016');
    expect(normDecimal(84016)).toBe('84016');
    expect(normDecimal('0.000100')).toBe('0.0001');
    expect(normDecimal('007.50')).toBe('7.5');
    expect(normDecimal('-0.0')).toBe('0');
    expect(normDecimal('abc')).toBe('abc');
  });

  it('reads Hyperliquid trades into one shape', () => {
    expect(hlTrade({ tid: 7, px: '1.10', sz: '3.0', time: 5, hash: '0x1' })).toEqual({
      tid: '7', px: '1.1', sz: '3', time: 5, hash: '0x1',
    });
    expect(hlTrade({ px: '1' })).toBeNull();
  });

  it('takes nearest-rank percentiles', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.99)).toBe(10);
  });

  it('adds sizes exactly', () => {
    expect(fromUnits(toUnits('0.1') + toUnits('0.2'))).toBe('0.3');
    expect(fromUnits(toUnits('5') - toUnits('5'))).toBe('0');
    expect(fromUnits(toUnits('-1.25'))).toBe('-1.25');
  });

  it('reads the clock error bound from chrony and systemd-timesyncd', () => {
    // offset 0.0005 s, root delay 0.002 s, root dispersion 0.001 s -> 0.5 + 1 + 1 ms
    const chrony = 'A1B2C3D4,ntp.example,2,1763600000.0,0.000500,0.0,0.0,0.0,0.0,0.0,0.002000,0.001000,64.0,Normal';
    expect(chronyBoundMs(chrony)).toBe(2.5);
    expect(chronyBoundMs('garbage')).toBeNull();
    const timesyncd = [
      '       Server: 185.125.190.56 (ntp.ubuntu.com)',
      '       Offset: -1.250ms',
      '        Delay: 20.000ms',
      'Root distance: 3.5ms (max: 5s)',
    ].join('\n');
    expect(timesyncdBoundMs(timesyncd)).toBe(14.75);
    // timedatectl prints a positive offset with a plus sign.
    expect(timesyncdBoundMs(timesyncd.replace('-1.250ms', '+1.250ms'))).toBe(14.75);
    expect(timesyncdBoundMs(['Offset: -571us', 'Delay: 12.781ms', 'Root distance: 22.620ms (max: 5s)'].join('\n'))).toBe(29.582);
    expect(timesyncdBoundMs('Offset: 1ms')).toBeNull();
  });
});

describe('TradeRace', () => {
  const T0 = 1_800_000_000_000;

  function connected(): TradeRace {
    const race = new TradeRace(['BTC', 'ETH']);
    race.markConnect('venue', T0);
    race.markConnect('stream', T0);
    return race;
  }

  it('pairs trades on coin and trade id and signs the lead from Stream', () => {
    const race = connected();
    const t = T0 + WARMUP_MS + 1000;
    race.seen('stream', 'BTC', trade(1, t - 300), t);
    race.seen('venue', 'BTC', trade(1, t - 300), t + 120);
    race.seen('venue', 'ETH', trade(2, t - 300), t);
    race.seen('stream', 'ETH', trade(2, t - 300, '100.6'), t + 40);
    race.seen('venue', 'BTC', trade(3, t - 300), t);
    race.seen('stream', 'BTC', trade(3, t - 300), t);
    race.settle(t + 200);
    const s = race.summary(T0, t + 1000);
    expect(s.matched).toBe(3);
    expect(s.matched_by_coin).toEqual({ BTC: 2, ETH: 1 });
    expect(s.stream_first).toBe(1);
    expect(s.ties).toBe(1);
    expect(s.identical_payloads).toBe(2);
    expect(s.lead_ms.p50).toBe(0);
    expect(s.lead_ms.p99).toBe(120);
    expect(s.lead_ms.mean).toBeCloseTo(26.7, 1);
    expect(s.block_to_arrival_ms.venue.p50).toBe(300);
    expect(s.block_to_arrival_ms.stream.p99).toBe(340);
  });

  it('counts a trade one feed never sent against that feed, after the grace period', () => {
    const race = connected();
    const t = T0 + WARMUP_MS + 1000;
    race.seen('venue', 'BTC', trade(1, t - 10), t);
    race.seen('stream', 'ETH', trade(2, t - 10), t);
    race.settle(t + GRACE_MS - 1);
    expect(race.waiting).toBe(2);
    race.settle(t + GRACE_MS);
    const s = race.summary(T0, t + GRACE_MS);
    expect(s.only_venue).toBe(1);
    expect(s.only_stream).toBe(1);
    expect(s.matched).toBe(0);
  });

  it('counts a copy that arrives after its trade settled as late, once', () => {
    const race = connected();
    const t = T0 + WARMUP_MS + 1000;
    race.seen('venue', 'BTC', trade(1, t - 10), t);
    race.settle(t + GRACE_MS);
    race.seen('stream', 'BTC', trade(1, t - 10), t + GRACE_MS + 500);
    race.seen('stream', 'BTC', trade(1, t - 10), t + GRACE_MS + 600);
    const s = race.summary(T0, t + GRACE_MS + 1000);
    expect(s.only_venue).toBe(1);
    expect(s.late_stream).toBe(1);
    expect(s.matched).toBe(0);
  });

  it('counts no late copy for an unattributed trade, or after LATE_MS, and opens no new entry for it', () => {
    const race = connected();
    const early = T0 + 1000; // Stream is still warming up: unattributed
    race.seen('venue', 'BTC', trade(1, early - 10), early);
    const t = T0 + WARMUP_MS + 1000;
    race.seen('venue', 'BTC', trade(2, t - 10), t); // counted against Stream
    race.settle(t + GRACE_MS);
    race.seen('stream', 'BTC', trade(1, early - 10), t + GRACE_MS + 100);
    race.seen('stream', 'BTC', trade(2, t - 10), t + LATE_MS + 1);
    race.settle(t + GRACE_MS * 3);
    const s = race.summary(T0, t + GRACE_MS * 3);
    expect(s.unattributed).toBe(1);
    expect(s.only_venue).toBe(1);
    expect(s.late_stream).toBe(0);
    expect(s.only_stream).toBe(0);
    expect(race.waiting).toBe(0);
  });

  it('keeps a one-sided trade for FORGET_MS so a very late copy never counts against the feed that was on time', () => {
    const race = connected();
    const t = T0 + WARMUP_MS + 1000;
    race.seen('venue', 'BTC', trade(1, t - 10), t);
    race.settle(t + GRACE_MS);
    race.settle(t + FORGET_MS - 1);
    race.seen('stream', 'BTC', trade(1, t - 10), t + FORGET_MS - 1);
    race.settle(t + FORGET_MS + GRACE_MS);
    const s = race.summary(T0, t + FORGET_MS + GRACE_MS);
    expect(s.only_venue).toBe(1);
    expect(s.only_stream).toBe(0);
    expect(s.late_stream).toBe(0);
  });

  it('does not blame a feed that was down or still warming up', () => {
    const race = connected();
    const early = T0 + 1000; // inside WARMUP_MS of both connections
    race.seen('venue', 'BTC', trade(1, early - 10), early);
    race.settle(early + GRACE_MS);
    race.markDisconnect('stream', early + GRACE_MS + 1);
    const later = T0 + WARMUP_MS + 20_000; // Stream is down
    race.seen('venue', 'BTC', trade(2, later - 10), later);
    race.settle(later + GRACE_MS);
    const s = race.summary(T0, later + GRACE_MS);
    expect(s.unattributed).toBe(2);
    expect(s.only_venue).toBe(0);
  });

  it('ignores replays of trades executed before the connection opened', () => {
    const race = connected();
    race.markConnect('venue', T0 + 60_000); // a reconnect replays recent trades
    race.seen('venue', 'BTC', trade(1, T0 + 59_000), T0 + 60_100);
    race.settle(T0 + 60_100 + GRACE_MS);
    const s = race.summary(T0, T0 + 80_000);
    expect(s.reconnects).toEqual({ venue: 1, stream: 0 });
    expect(s.only_venue + s.only_stream + s.unattributed + s.matched).toBe(0);
  });

  it('opens no trade after the run closes but still pairs the ones already seen', () => {
    const race = connected();
    const t = T0 + WARMUP_MS + 1000;
    race.seen('venue', 'BTC', trade(1, t - 10), t);
    race.closedAt = t + 1;
    race.seen('stream', 'BTC', trade(1, t - 10), t + 50);
    race.seen('stream', 'BTC', trade(2, t - 10), t + 50);
    race.settle(t + GRACE_MS + 100);
    const s = race.summary(T0, t + 1);
    expect(s.matched).toBe(1);
    expect(s.only_stream).toBe(0);
    expect(s.lead_ms.p50).toBe(-50);
  });

  it('reports the share of the run each connection was open', () => {
    const race = new TradeRace(['BTC']);
    race.markConnect('venue', T0);
    race.markConnect('stream', T0 + 25_000);
    race.markDisconnect('stream', T0 + 50_000);
    const s = race.summary(T0, T0 + 100_000);
    expect(s.connected_share).toEqual({ venue: 1, stream: 0.25 });
  });
});

describe('L4 timing and book check', () => {
  it('times each L4 batch by its newest block timestamp', () => {
    const l4 = new L4Ages();
    l4.batch([{ ts: 1000 }, { ts: 1100 }], 1300);
    l4.batch([{ nots: 1 }], 1300);
    l4.batch('nope', 1300);
    expect(l4.summary()).toEqual({ batches: 1, block_to_arrival_ms: { p50: 200, p90: 200, p99: 200 } });
  });

  const snapshot = {
    type: 'l4_snapshot',
    last_block_number: 100,
    timestamp: 10_000,
    data: {
      bids: [
        { oid: 1, side: 'B', price: '99.0', size: '1.5' },
        { oid: 2, side: 'B', price: '99', size: '0.5' },
        { oid: 3, side: 'B', price: '98', size: '1' },
      ],
      asks: [{ oid: 4, side: 'A', price: '101', size: '2' }],
    },
  };

  it('rebuilds price levels from a snapshot and new, update and remove diffs', () => {
    const book = new L4Book(snapshot.data);
    expect(book.top('B')).toEqual([['99', '2', 2], ['98', '1', 1]]);
    expect(book.apply({ dt: 'update', oid: 1, sz: '1.25' })).toBe(true);
    expect(book.apply({ dt: 'remove', oid: 3 })).toBe(true);
    expect(book.apply({ dt: 'new', oid: 5, side: 'A', px: '100.5', sz: '0.1' })).toBe(true);
    expect(book.apply({ dt: 'remove', oid: 999 })).toBe(false);
    expect(book.top('B')).toEqual([['99', '1.75', 2]]);
    expect(book.top('A')).toEqual([['100.5', '0.1', 1], ['101', '2', 1]]);
  });

  it('compares the rebuilt book with the venue book at the same block', () => {
    const check = new BookCheck('BTC');
    check.venueBook({ time: 9_000, levels: [[], []] }); // before the snapshot: ignored
    check.snapshot(snapshot);
    check.batch([{ bn: 101, ts: 10_500, dt: 'update', oid: 1, sz: '1' }]);
    // Venue book stamped between the snapshot and block 101: compared with the snapshot state.
    check.venueBook({
      time: 10_200,
      levels: [
        [{ px: '99', sz: '2', n: 2 }, { px: '98', sz: '1.0', n: 1 }],
        [{ px: '101', sz: '2', n: 1 }],
      ],
    });
    // Stamped after the newest block: waits for a later block, then compares with block 101.
    check.venueBook({ time: 10_600, levels: [[{ px: '99', sz: '1.5', n: 2 }], [{ px: '101', sz: '2', n: 1 }]] });
    check.batch([{ bn: 104, ts: 11_000, dt: 'new', oid: 9, side: 'A', px: '100', sz: '1' }]);
    // A wrong venue size is a mismatch, reported at its first differing level.
    check.venueBook({ time: 11_100, levels: [[{ px: '99', sz: '1.5', n: 2 }], [{ px: '100', sz: '9', n: 1 }]] });
    check.batch([{ bn: 105, ts: 11_500, dt: 'remove', oid: 9 }]);
    const s = check.summary();
    expect(s).toMatchObject({ checks: 3, match: 2, mismatch: 1, blocks: 3, block_gaps: 2, snapshot_block: 100 });
    expect(s.mismatch_sample).toMatchObject({ side: 'A', level: 0, venue: ['100', '9', 1], stream: ['100', '1', 1] });
  });

  it('reports a missing level as a difference', () => {
    const venue = venueLevels([[{ px: '1', sz: '1', n: 1 }, { px: '0.9', sz: '1', n: 1 }], []]);
    expect(compareLevels([[['1', '1', 1]], []], venue)).toMatchObject({ side: 'B', level: 1, stream: null });
  });
});

// ── The command, on fake sockets and fake timers ───────────────────────────

type Handler = ((event: any) => void) | null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly sent: string[] = [];
  readyState = 0;
  onopen: Handler = null;
  onmessage: Handler = null;
  onerror: Handler = null;
  onclose: Handler = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

const KEY = 'test-key-0123456789';

/** Wait (in real time, while the command tree loads) until `n` sockets exist. */
async function sockets(n: number): Promise<void> {
  await vi.waitFor(() => {
    if (FakeWebSocket.instances.length < n) throw new Error(`${FakeWebSocket.instances.length} of ${n} sockets`);
  }, { timeout: 5000, interval: 5 });
}

function socket(prefix: string): FakeWebSocket {
  const ws = FakeWebSocket.instances.find((w) => w.url.startsWith(prefix));
  if (!ws) throw new Error(`no socket for ${prefix}`);
  return ws;
}

describe('oxa bench', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    captureIo();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    net.probeConnections
      .mockReset()
      .mockImplementation(async (_url: string, n: number) => Array.from({ length: n }, () => ({ status: 101, body: '' })));
    net.readClockBound.mockReset().mockResolvedValue({ bound_ms: 1.5, source: 'chrony' });
    process.env.OXA_API_KEY = KEY;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.OXA_API_KEY;
  });

  it.each([
    [['--duration', '5'], 'Invalid --duration'],
    [['--duration', '1.5'], 'Invalid --duration'],
    [['--coins', ' , '], 'Invalid --coins'],
    [['--book-seconds', '9999'], 'Invalid --book-seconds'],
  ])('refuses %j before connecting', async (args, message) => {
    expect(await runCli('bench', ...args)).toBe(2);
    expect(lastError().error).toContain(message);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('needs an API key', async () => {
    delete process.env.OXA_API_KEY;
    expect(await runCli('bench')).toBe(3);
    expect(lastError().error).toContain('API key required');
  });

  it('exits with an auth error, without the key, when Stream refuses it', async () => {
    net.probeConnections.mockResolvedValue([{ status: 401, body: 'Invalid API key' }]);
    expect(await runCli('bench', '--duration', '10')).toBe(3);
    expect(lastError().error).toBe(
      '0xArchive Stream refused the API key (HTTP 401) at wss://stream.0xarchive.io/ws: Invalid API key. Check it with `oxa auth test`.',
    );
    expect(stderrText()).not.toContain(KEY);
    expect(net.probeConnections.mock.calls[0]).toEqual([`wss://stream.0xarchive.io/ws?apiKey=${KEY}`, 2]);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('checks for one Stream connection with --no-l4', async () => {
    net.probeConnections.mockResolvedValue([{ status: 401, body: 'Invalid API key' }]);
    expect(await runCli('bench', '--no-l4')).toBe(3);
    expect(net.probeConnections.mock.calls[0][1]).toBe(1);
  });

  it('exits before the race when the account cannot hold two Stream connections at once', async () => {
    net.probeConnections.mockResolvedValue([
      { status: 101, body: '' },
      { status: 429, body: 'Connection limit reached (2/2). Upgrade your plan for more connections.' },
    ]);
    expect(await runCli('bench')).toBe(4);
    expect(lastError()).toMatchObject({ code: 4, error_code: 'rate_limited', status: 429 });
    expect(lastError().error).toContain('oxa bench needs 2 0xArchive Stream connections at once');
    expect(lastError().error).toContain('Connection limit reached (2/2)');
    expect(lastError().error).toContain('--no-l4');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("names the plan refusal when Stream refuses a Free account's live data", async () => {
    net.probeConnections.mockResolvedValue([
      {
        status: 403,
        body: JSON.stringify({
          success: false,
          code: 403,
          error_code: 'forbidden',
          reason: 'today_needs_build',
          error: 'Free data runs through yesterday (UTC). Live streams need Build. Upgrade at https://0xarchive.io/pricing.',
        }),
      },
    ]);
    expect(await runCli('bench')).toBe(3);
    expect(lastError()).toMatchObject({ code: 3, error_code: 'forbidden', reason: 'today_needs_build', status: 403 });
    expect(lastError().error).toBe(
      '0xArchive Stream refused the connection (HTTP 403) at wss://stream.0xarchive.io/ws: Free data runs through yesterday (UTC). Live streams need Build. Upgrade at https://0xarchive.io/pricing.',
    );
  });

  it('exits with a network error when Stream cannot be reached', async () => {
    net.probeConnections.mockResolvedValue([{ status: null, body: '' }]);
    expect(await runCli('bench')).toBe(4);
    expect(lastError().error).toBe('Could not reach 0xArchive Stream at wss://stream.0xarchive.io/ws. Check your network.');
  });

  it.each([
    ['--hl-url', 'https://api.hyperliquid.xyz/ws'],
    ['--stream-url', 'stream.0xarchive.io/ws?apiKey=secret'],
  ])('refuses %s %s before connecting', async (flag, value) => {
    expect(await runCli('bench', flag, value)).toBe(2);
    expect(lastError().error).toContain(`Invalid ${flag}`);
    expect(stderrText()).not.toContain('secret');
    expect(net.probeConnections).not.toHaveBeenCalled();
  });

  it('asks for Node.js 22 when there is no built-in WebSocket', async () => {
    vi.stubGlobal('WebSocket', undefined);
    expect(await runCli('bench')).toBe(2);
    expect(lastError().error).toContain('Node.js 22 or newer');
  });

  /** Drive a Hyperliquid race: 3 matched trades, 1 seen on Hyperliquid only, 1 replay. */
  async function driveHyperliquid(): Promise<void> {
    await sockets(3);
    const hl = socket('wss://api.hyperliquid.xyz/ws');
    const stream = socket('wss://stream.0xarchive.io/ws?apiKey=');
    const l4 = FakeWebSocket.instances.filter((w) => w.url.startsWith('wss://stream.0xarchive.io/ws'))[1];
    hl.open();
    stream.open();
    l4.open();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hl.sent.map((f) => JSON.parse(f))).toEqual([
      { method: 'subscribe', subscription: { type: 'trades', coin: 'BTC' } },
      { method: 'subscribe', subscription: { type: 'trades', coin: 'ETH' } },
    ]);
    expect(stream.sent.map((f) => JSON.parse(f))).toEqual([
      { op: 'subscribe', channel: 'trades', symbol: 'BTC' },
      { op: 'subscribe', channel: 'trades', symbol: 'ETH' },
    ]);
    expect(l4.sent.map((f) => JSON.parse(f).channel)).toEqual(['l4_diffs', 'l4_diffs']);

    // A replay of an older trade on subscribe never enters the race.
    hl.message({ channel: 'trades', data: [{ coin: 'BTC', tid: 1, px: '1', sz: '1', time: Date.now() - 60_000, hash: 'r' }] });
    await vi.advanceTimersByTimeAsync(16_000);
    const time = Date.now() - 200;
    const row = (tid: number, px = '100.0') => ({ coin: 'BTC', tid, px, sz: '0.5', time, hash: `0x${tid}` });
    stream.message({ type: 'data', channel: 'trades', data: [row(10), row(11)] });
    await vi.advanceTimersByTimeAsync(80);
    hl.message({ channel: 'trades', data: [row(10), row(11, '100.1')] });
    await vi.advanceTimersByTimeAsync(20);
    hl.message({ channel: 'trades', data: [row(12)] });
    stream.message({ type: 'data', channel: 'trades', data: row(12) });
    hl.message({ channel: 'trades', data: [row(13)] });
    l4.message({ type: 'l4_batch', data: [{ ts: Date.now() - 150 }] });
    await vi.advanceTimersByTimeAsync(60_000);
  }

  it('races Stream against Hyperliquid and prints the result as JSON', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const done = runCli('bench', '--coins', 'BTC,ETH', '--duration', '30', '--json');
    await driveHyperliquid();
    expect(await done).toBe(0);

    const result = stdoutJson() as BenchResult;
    const r = result.races.hyperliquid!;
    expect(r).toMatchObject({
      venue_feed: 'wss://api.hyperliquid.xyz/ws',
      stream_feed: 'wss://stream.0xarchive.io/ws',
      matched: 3,
      stream_first: 2,
      ties: 1,
      identical_payloads: 2,
      only_venue: 1,
      only_stream: 0,
      unattributed: 0,
      reconnects: { venue: 0, stream: 0 },
    });
    expect(r.lead_ms.p50).toBe(80);
    expect(r.stream_first_share).toBe(0.6666);
    expect(result.l4).toMatchObject({ batches: 1, block_to_arrival_ms: { p50: 150 } });
    expect(result.host).toMatchObject({ clock_bound_ms: 1.5, clock_source: 'chrony' });
    expect(result.duration_s).toBe(30);
    expect(stdoutText() + stderrText()).not.toContain(KEY);
    // Every socket was closed at the end.
    expect(FakeWebSocket.instances.every((w) => w.readyState === 3)).toBe(true);
  });

  it('prints a readable summary by default', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const done = runCli('bench', '--coins', 'BTC,ETH', '--duration', '30');
    await driveHyperliquid();
    expect(await done).toBe(0);
    const text = stdoutText();
    expect(text).toContain("Hyperliquid trades: Hyperliquid's WebSocket and 0xArchive Stream (BTC, ETH)");
    expect(text).toContain('Matched trades: 3');
    expect(text).toContain('Stream first: 66.6% (2 of 3, 1 tied)');
    expect(text).toContain('Identical payloads: 66.6% (2 of 3');
    expect(text).toContain('Seen on one feed only: Hyperliquid only 1, Stream only 0');
    expect(text).toContain('clock within 1.5 ms (chrony)');
    expect(text).toMatch(/Connected: Hyperliquid \d+\.\d%, Stream \d+\.\d% of the run/);
    expect(text).not.toContain(KEY);
  });

  it('keeps racing trades when the plan has no L4, and says why L4 is empty', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const run = runBench({ coins: 'BTC', duration: '10', l4: true, bookSeconds: '60', format: 'json', apiKey: KEY });
    await vi.advanceTimersByTimeAsync(0);
    const [, , l4] = FakeWebSocket.instances;
    l4.open();
    l4.message({ type: 'error', message: 'Your plan does not include l4_diffs', error_code: 'forbidden' });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await run;
    expect(result.l4?.unavailable).toBe('Your plan does not include l4_diffs');
    expect(result.races.hyperliquid).toBeDefined();
  });

  it('exits on a Stream error on the trades feed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const done = runCli('bench', '--coins', 'BTC', '--duration', '30', '--no-l4');
    await sockets(2);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const stream = socket('wss://stream.0xarchive.io/ws?apiKey=');
    stream.open();
    stream.message({ type: 'error', message: 'Rate limit exceeded', error_code: 'rate_limited' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await done).toBe(4);
    expect(lastError()).toMatchObject({ error: 'stream error: Rate limit exceeded', error_code: 'rate_limited' });
  });

  it('checks the rebuilt book against Hyperliquid\'s levels after the race', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const run = runBench({ coins: 'BTC', duration: '10', l4: false, book: true, bookSeconds: '10', format: 'json', apiKey: KEY });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_500); // the race ends at 10 s; the book check starts
    const stream = FakeWebSocket.instances[2];
    const hl = FakeWebSocket.instances[3];
    expect(stream.url.startsWith('wss://stream.0xarchive.io/ws?apiKey=')).toBe(true);
    stream.open();
    hl.open();
    await vi.advanceTimersByTimeAsync(10);
    expect(JSON.parse(hl.sent[0])).toEqual({ method: 'subscribe', subscription: { type: 'l2Book', coin: 'BTC' } });
    const now = Date.now();
    stream.message({ type: 'l4_snapshot', last_block_number: 7, timestamp: now - 1000, data: { bids: [{ oid: 1, side: 'B', price: '10', size: '1' }], asks: [] } });
    hl.message({ channel: 'l2Book', data: { time: now - 500, levels: [[{ px: '10', sz: '1', n: 1 }], []] } });
    stream.message({ type: 'l4_batch', data: [{ bn: 8, ts: now - 400, dt: 'new', oid: 2, side: 'A', px: '11', sz: '1' }] });
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await run;
    expect(result.book_check).toMatchObject({ seconds_per_coin: 10, coins: [{ coin: 'BTC', checks: 1, match: 1, mismatch: 0 }] });
  });
});
