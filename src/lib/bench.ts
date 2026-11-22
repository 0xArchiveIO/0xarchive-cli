// The measurement behind `oxa bench`, run from the customer's machine.
//
// A venue's official WebSocket and 0xArchive Stream are received by one process,
// so a paired trade's lead is two receipt times on the same clock. No clock skew
// between the two sources can enter it. For every trade seen on both feeds (same
// coin and trade id) within GRACE_MS:
//
//   lead_ms   = venue receipt - Stream receipt   (positive: Stream arrived first)
//   identical = same price, size, trade time and transaction hash
//
// A trade seen on only one feed after GRACE_MS counts against the other feed,
// unless that feed was down or had connected less than WARMUP_MS before
// (unattributed). A copy that turns up after its trade was counted against its
// feed, and within LATE_MS of the first copy, is also counted as late, so late
// copies are always part of the one-feed-only count. A copy later than that is
// ignored for up to FORGET_MS, so it never opens a one-sided entry against the
// feed that was on time. Copies of trades executed before their connection
// opened (Hyperliquid replays its recent trades on every subscribe) are ignored.
//
// Block to arrival reads this machine's clock against the venue's trade time, so
// it is only as good as the clock; the summary reports the clock's error bound
// when chrony or systemd-timesyncd can tell it.

export const GRACE_MS = 10_000;
export const WARMUP_MS = 15_000;
export const LATE_MS = 120_000;
export const FORGET_MS = 600_000;
export const BOOK_LEVELS = 20;

export type FeedSide = 'venue' | 'stream';

/** One trade in the shape both feeds can be read into. */
export interface BenchTrade {
  tid: string;
  px: string;
  sz: string;
  time: number;
  hash: string;
}

/** '84016.0', 84016 and '84016' all read as '84016'. */
export function normDecimal(value: unknown): string {
  const text = String(value ?? '').trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return text;
  const whole = match[2].replace(/^0+(?=\d)/, '') || '0';
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const sign = match[1] && (whole !== '0' || fraction !== '') ? '-' : '';
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** A Hyperliquid (or Stream) trade row as a BenchTrade, or null without a trade id. */
export function hlTrade(row: any): BenchTrade | null {
  if (row?.tid === undefined || row?.tid === null) return null;
  return {
    tid: String(row.tid),
    px: normDecimal(row.px),
    sz: normDecimal(row.sz),
    time: Number(row.time ?? 0) || 0,
    hash: String(row.hash ?? ''),
  };
}

function samePayload(a: BenchTrade, b: BenchTrade): boolean {
  return a.px === b.px && a.sz === b.sz && a.time === b.time && a.hash === b.hash;
}

/** Nearest-rank percentile of unsorted values, or null when there are none. */
export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
}

export interface Percentiles {
  p10?: number | null;
  p50: number | null;
  p90: number | null;
  p99: number | null;
}

function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export function percentiles(values: readonly number[], withP10 = false): Percentiles {
  const out: Percentiles = {
    p50: round1(percentile(values, 0.5)),
    p90: round1(percentile(values, 0.9)),
    p99: round1(percentile(values, 0.99)),
  };
  return withP10 ? { p10: round1(percentile(values, 0.1)), ...out } : out;
}

interface Pending {
  first: number;
  venue?: { recv: number; trade: BenchTrade };
  stream?: { recv: number; trade: BenchTrade };
}

interface Settled {
  /** When it settled, or when its last copy arrived. */
  at: number;
  first: number;
  /** The feed whose copy has not arrived yet, if any. */
  missing: FeedSide | null;
  /** True when the missing copy was counted against its feed. */
  attributed: boolean;
}

export interface RaceSummary {
  coins: string[];
  matched: number;
  matched_by_coin: Record<string, number>;
  stream_first: number;
  ties: number;
  stream_first_share: number | null;
  identical_payloads: number;
  identical_share: number | null;
  lead_ms: Percentiles & { mean: number | null };
  only_venue: number;
  only_stream: number;
  unattributed: number;
  late_venue: number;
  late_stream: number;
  block_to_arrival_ms: { venue: Percentiles; stream: Percentiles };
  reconnects: { venue: number; stream: number };
  connected_share: { venue: number | null; stream: number | null };
}

/**
 * The pairing and attribution of one venue's race. Times are milliseconds on
 * this machine's clock; the caller feeds receipts and calls settle() on a tick.
 */
export class TradeRace {
  private pending = new Map<string, Pending>();
  private settled = new Map<string, Settled>();
  private connectedAt: Record<FeedSide, number> = { venue: 0, stream: 0 };
  private up: Record<FeedSide, Array<[number, number]>> = { venue: [], stream: [] };
  private upOpen: Record<FeedSide, number | null> = { venue: null, stream: null };
  readonly reconnects: Record<FeedSide, number> = { venue: 0, stream: 0 };
  private leads: number[] = [];
  private venueAges: number[] = [];
  private streamAges: number[] = [];
  private equal = 0;
  private streamFirst = 0;
  private ties = 0;
  private onlyVenue = 0;
  private onlyStream = 0;
  private unattributed = 0;
  private lateVenue = 0;
  private lateStream = 0;
  private perCoin = new Map<string, number>();
  /** Receipts at or after this time open no new trade (the run is over). */
  closedAt = Infinity;

  constructor(readonly coins: string[]) {}

  markConnect(side: FeedSide, now: number): void {
    if (this.connectedAt[side]) this.reconnects[side] += 1;
    this.connectedAt[side] = now;
    this.upOpen[side] = now;
  }

  markDisconnect(side: FeedSide, now: number): void {
    const open = this.upOpen[side];
    if (open !== null) {
      this.up[side].push([open, now]);
      this.upOpen[side] = null;
    }
  }

  seen(side: FeedSide, coin: string, trade: BenchTrade | null, recv: number): void {
    if (!trade) return;
    const key = `${coin}\u0000${trade.tid}`;
    const done = this.settled.get(key);
    if (done) {
      if (done.missing === side) {
        // Late only when the trade was counted against this feed and the copy
        // came within LATE_MS; a later copy is ignored.
        if (done.attributed && recv - done.first <= LATE_MS) {
          if (side === 'venue') this.lateVenue += 1;
          else this.lateStream += 1;
        }
        // Restart the short expiry from this copy, so a second row for the
        // same trade (Stream sends one per fill leg) still finds the entry.
        done.missing = null;
        done.at = recv;
      }
      return;
    }
    // Executed before this connection existed: a replay, never a race entry.
    if (trade.time && trade.time < this.connectedAt[side]) return;
    let entry = this.pending.get(key);
    if (!entry) {
      if (recv >= this.closedAt) return;
      entry = { first: recv };
      this.pending.set(key, entry);
    }
    if (!entry[side]) entry[side] = { recv, trade };
  }

  /** True when this feed's connection had been up for WARMUP_MS at time t. */
  private attributable(side: FeedSide, t: number): boolean {
    const spans = [...this.up[side]];
    const open = this.upOpen[side];
    if (open !== null) spans.push([open, Infinity]);
    return spans.some(([a, b]) => a + WARMUP_MS <= t && t < b);
  }

  /** Close trades that paired or whose grace has passed. */
  settle(now: number): void {
    for (const [key, s] of this.settled) {
      if (s.missing ? now - s.first > FORGET_MS : now - s.at > 3 * GRACE_MS) this.settled.delete(key);
    }
    for (const [key, e] of this.pending) {
      const paired = e.venue !== undefined && e.stream !== undefined;
      if (!paired && now - e.first < GRACE_MS) continue;
      this.pending.delete(key);
      if (e.venue && e.stream) {
        this.settled.set(key, { at: now, first: e.first, missing: null, attributed: false });
        const coin = key.slice(0, key.indexOf('\u0000'));
        this.perCoin.set(coin, (this.perCoin.get(coin) ?? 0) + 1);
        const lead = e.venue.recv - e.stream.recv;
        this.leads.push(lead);
        if (lead > 0) this.streamFirst += 1;
        else if (lead === 0) this.ties += 1;
        if (samePayload(e.venue.trade, e.stream.trade)) this.equal += 1;
        if (e.venue.trade.time) this.venueAges.push(e.venue.recv - e.venue.trade.time);
        if (e.stream.trade.time) this.streamAges.push(e.stream.recv - e.stream.trade.time);
      } else {
        const missing: FeedSide = e.venue ? 'stream' : 'venue';
        const attributed = this.attributable(missing, e.first);
        this.settled.set(key, { at: now, first: e.first, missing, attributed });
        if (!attributed) this.unattributed += 1;
        else if (missing === 'stream') this.onlyVenue += 1;
        else this.onlyStream += 1;
      }
    }
  }

  /** Trades still waiting for a second copy. */
  get waiting(): number {
    return this.pending.size;
  }

  private connectedShare(side: FeedSide, start: number, end: number): number | null {
    if (end <= start) return null;
    const spans = [...this.up[side]];
    const open = this.upOpen[side];
    if (open !== null) spans.push([open, end]);
    const ms = spans.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, end) - Math.max(a, start)), 0);
    return Math.round((ms / (end - start)) * 10000) / 10000;
  }

  summary(start: number, end: number): RaceSummary {
    const matched = this.leads.length;
    const share = (n: number) => (matched ? Math.floor((n / matched) * 10000) / 10000 : null);
    const mean = matched ? Math.round((this.leads.reduce((a, b) => a + b, 0) / matched) * 10) / 10 : null;
    return {
      coins: this.coins,
      matched,
      matched_by_coin: Object.fromEntries(this.coins.map((c) => [c, this.perCoin.get(c) ?? 0])),
      stream_first: this.streamFirst,
      ties: this.ties,
      stream_first_share: share(this.streamFirst),
      identical_payloads: this.equal,
      identical_share: share(this.equal),
      lead_ms: { mean, ...percentiles(this.leads, true) },
      only_venue: this.onlyVenue,
      only_stream: this.onlyStream,
      unattributed: this.unattributed,
      late_venue: this.lateVenue,
      late_stream: this.lateStream,
      block_to_arrival_ms: { venue: percentiles(this.venueAges), stream: percentiles(this.streamAges) },
      reconnects: { ...this.reconnects },
      connected_share: {
        venue: this.connectedShare('venue', start, end),
        stream: this.connectedShare('stream', start, end),
      },
    };
  }
}

/** Block-to-arrival of Stream's L4 diffs: receipt minus the newest item's block time. */
export class L4Ages {
  private ages: number[] = [];
  batches = 0;
  snapshots = 0;

  batch(items: unknown, recv: number): void {
    if (!Array.isArray(items)) return;
    let newest = -Infinity;
    for (const item of items) {
      const ts = (item as { ts?: unknown })?.ts;
      if (typeof ts === 'number' && ts > newest) newest = ts;
    }
    if (newest === -Infinity) return;
    this.batches += 1;
    this.ages.push(recv - newest);
  }

  summary(): { batches: number; block_to_arrival_ms: Percentiles } {
    return { batches: this.batches, block_to_arrival_ms: percentiles(this.ages) };
  }
}

// ── Book check ────────────────────────────────────────────────────────────
//
// Stream's L4 book, rebuilt from its snapshot and diffs the way a customer
// rebuilds it, compared with Hyperliquid's own l2Book (top 20 price levels per
// side, each with total size and order count) at the same block. A match proves
// the rebuilt book agrees with the venue at the aggregate-level granularity the
// venue publishes, not each resting order's identity or queue position.

const SCALE = 18;
const SCALE_FACTOR = 10n ** BigInt(SCALE);

/** An exact decimal string as a scaled integer (18 places), so sizes add exactly. */
export function toUnits(value: unknown): bigint {
  const text = normDecimal(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return 0n;
  const fraction = (match[3] ?? '').slice(0, SCALE).padEnd(SCALE, '0');
  const units = BigInt(match[2]) * SCALE_FACTOR + BigInt(fraction || '0');
  return match[1] ? -units : units;
}

export function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / SCALE_FACTOR;
  const fraction = (abs % SCALE_FACTOR).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export type BookSide = 'B' | 'A';
/** One price level: price, total size, order count. */
export type Level = [string, string, number];

export class L4Book {
  private orders = new Map<string, { side: BookSide; px: string; sz: bigint }>();
  private levels: Record<BookSide, Map<string, { sz: bigint; n: number }>> = { B: new Map(), A: new Map() };

  constructor(snapshot: any) {
    for (const o of [...(snapshot?.bids ?? []), ...(snapshot?.asks ?? [])]) {
      this.add(String(o.oid), o.side === 'A' ? 'A' : 'B', o.price, o.size);
    }
  }

  private add(oid: string, side: BookSide, px: unknown, sz: unknown): void {
    if (this.orders.has(oid)) this.remove(oid);
    const price = normDecimal(px);
    const size = toUnits(sz);
    this.orders.set(oid, { side, px: price, sz: size });
    const level = this.levels[side].get(price) ?? { sz: 0n, n: 0 };
    level.sz += size;
    level.n += 1;
    this.levels[side].set(price, level);
  }

  private remove(oid: string): boolean {
    const o = this.orders.get(oid);
    if (!o) return false;
    this.orders.delete(oid);
    const level = this.levels[o.side].get(o.px)!;
    level.sz -= o.sz;
    level.n -= 1;
    if (level.n === 0) this.levels[o.side].delete(o.px);
    return true;
  }

  private update(oid: string, sz: unknown): boolean {
    const o = this.orders.get(oid);
    if (!o) return false;
    const size = toUnits(sz);
    this.levels[o.side].get(o.px)!.sz += size - o.sz;
    o.sz = size;
    return true;
  }

  /** One l4_diffs item. False when it names an order the book does not hold. */
  apply(item: any): boolean {
    switch (item?.dt) {
      case 'new':
        this.add(String(item.oid), item.side === 'A' ? 'A' : 'B', item.px, item.sz);
        return true;
      case 'remove':
        return this.remove(String(item.oid));
      case 'update':
        return this.update(String(item.oid), item.sz);
      default:
        return true;
    }
  }

  top(side: BookSide, n = BOOK_LEVELS): Level[] {
    const prices = [...this.levels[side].keys()].sort((a, b) =>
      side === 'B' ? Number(b) - Number(a) : Number(a) - Number(b),
    );
    return prices.slice(0, n).map((px) => {
      const level = this.levels[side].get(px)!;
      return [px, fromUnits(level.sz), level.n];
    });
  }
}

/** Hyperliquid l2Book levels ([bids, asks], each [{px, sz, n}]) as comparable levels. */
export function venueLevels(levels: any): [Level[], Level[]] {
  const side = (rows: any): Level[] =>
    (Array.isArray(rows) ? rows : []).map((l: any) => [normDecimal(l.px), normDecimal(l.sz), Number(l.n)]);
  return [side(levels?.[0]), side(levels?.[1])];
}

export interface LevelDiff {
  side: BookSide;
  level: number;
  stream: Level | null;
  venue: Level;
}

/** Null when the venue's top levels all agree with ours, else the first difference. */
export function compareLevels(ours: [Level[], Level[]], venue: [Level[], Level[]]): LevelDiff | null {
  const sides: BookSide[] = ['B', 'A'];
  for (let s = 0; s < 2; s += 1) {
    for (let i = 0; i < venue[s].length; i += 1) {
      const a = ours[s][i] ?? null;
      const b = venue[s][i];
      if (!a || a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) {
        return { side: sides[s], level: i, stream: a, venue: b };
      }
    }
  }
  return null;
}

export interface BookCheckSummary {
  coin: string;
  levels: number;
  checks: number;
  match: number;
  mismatch: number;
  too_old: number;
  snapshot_block: number | null;
  blocks: number;
  block_gaps: number;
  unknown_orders: number;
  mismatch_sample: (LevelDiff & { venue_time: number; block: number }) | null;
}

/**
 * One coin's book check. Stream usually delivers a block before Hyperliquid
 * publishes its book for that block, so each block's top levels are kept and a
 * venue book stamped T is compared with the state after the last block at or
 * before T, once a block later than T has arrived.
 */
export class BookCheck {
  static readonly HISTORY = 600;
  private book: L4Book | null = null;
  private snapshotBlock: number | null = null;
  private lastBlock = 0;
  private lastTs = 0;
  private history: Array<{ ts: number; bn: number; top: [Level[], Level[]] }> = [];
  private waiting: Array<{ t: number; levels: [Level[], Level[]] }> = [];
  private checks = 0;
  private match = 0;
  private mismatch = 0;
  private tooOld = 0;
  private blocks = 0;
  private blockGaps = 0;
  private unknownOrders = 0;
  private sample: BookCheckSummary['mismatch_sample'] = null;

  constructor(readonly coin: string) {}

  private remember(): void {
    this.history.push({ ts: this.lastTs, bn: this.lastBlock, top: [this.book!.top('B'), this.book!.top('A')] });
    if (this.history.length > BookCheck.HISTORY) this.history.shift();
  }

  snapshot(frame: any): void {
    this.book = new L4Book(frame?.data);
    this.snapshotBlock = this.lastBlock = Number(frame?.last_block_number ?? 0);
    this.lastTs = Number(frame?.timestamp ?? 0);
    this.history = [];
    this.remember();
  }

  batch(items: any): void {
    if (!this.book || !Array.isArray(items) || items.length === 0) return;
    const bn = Math.max(...items.map((d: any) => Number(d?.bn ?? 0)));
    const ts = Math.max(...items.map((d: any) => Number(d?.ts ?? 0)));
    if (bn <= this.lastBlock) return;
    this.blockGaps += bn - this.lastBlock - 1;
    this.blocks += 1;
    for (const item of items) if (!this.book.apply(item)) this.unknownOrders += 1;
    this.lastBlock = bn;
    this.lastTs = ts;
    this.remember();
    const ready = this.waiting.filter((w) => w.t < ts);
    this.waiting = this.waiting.filter((w) => w.t >= ts);
    for (const w of ready) this.check(w.t, w.levels);
  }

  venueBook(data: any): void {
    if (!this.book) return;
    const t = Number(data?.time ?? 0);
    const levels = venueLevels(data?.levels);
    if (t >= this.lastTs) this.waiting.push({ t, levels });
    else this.check(t, levels);
  }

  private check(t: number, levels: [Level[], Level[]]): void {
    let state: { bn: number; top: [Level[], Level[]] } | null = null;
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      if (this.history[i].ts <= t) {
        state = this.history[i];
        break;
      }
    }
    if (!state) {
      this.tooOld += 1;
      return;
    }
    this.checks += 1;
    const diff = compareLevels(state.top, levels);
    if (!diff) this.match += 1;
    else {
      this.mismatch += 1;
      this.sample ??= { venue_time: t, block: state.bn, ...diff };
    }
  }

  summary(): BookCheckSummary {
    return {
      coin: this.coin,
      levels: BOOK_LEVELS,
      checks: this.checks,
      match: this.match,
      mismatch: this.mismatch,
      too_old: this.tooOld,
      snapshot_block: this.snapshotBlock,
      blocks: this.blocks,
      block_gaps: this.blockGaps,
      unknown_orders: this.unknownOrders,
      mismatch_sample: this.sample,
    };
  }
}

// ── Clock ─────────────────────────────────────────────────────────────────

/** Clock error bound (ms) from one line of `chronyc -c tracking`, or null. */
export function chronyBoundMs(csvLine: string): number | null {
  const f = csvLine.trim().split(',');
  const offset = Number(f[4]);
  const delay = Number(f[10]);
  const dispersion = Number(f[11]);
  if (f.length < 12 || ![offset, delay, dispersion].every(Number.isFinite)) return null;
  return Math.round((Math.abs(offset) + delay / 2 + dispersion) * 1e6) / 1e3;
}

const UNIT_MS: Record<string, number> = { ns: 1e-6, us: 1e-3, '\u00b5s': 1e-3, ms: 1, s: 1000, min: 60000 };

/** Clock error bound (ms) from `timedatectl timesync-status`, or null. */
export function timesyncdBoundMs(text: string): number | null {
  const values: Record<string, number> = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf(':');
    if (at < 0) continue;
    const name = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().split(/\s+/)[0] ?? '';
    // timedatectl signs the offset (`+1.317ms`, `-264us`).
    const match = /^([+-]?[\d.]+)([a-z\u00b5]+)$/.exec(value);
    if (match && UNIT_MS[match[2]] !== undefined) values[name] = Number(match[1]) * UNIT_MS[match[2]];
  }
  if ([values.Offset, values.Delay, values['Root distance']].some((v) => v === undefined)) return null;
  return Math.round((Math.abs(values.Offset) + values.Delay / 2 + values['Root distance']) * 1000) / 1000;
}
