import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureIo, lastError, runCli, stdoutJson, stdoutText, stderrText } from './helpers.js';

// The SDK resources behind breadth, CVD, the HIP-3 oracle, HIP-4 questions,
// wallet classification, the symbol list, liquidation and trigger levels, and
// the flags this release removes. Each test parses a real argument vector with
// the command tree and checks the SDK call and the output.
const sdk = vi.hoisted(() => {
  const venue = () => ({
    breadth: { current: vi.fn(), history: vi.fn() } as Record<string, any> | undefined,
    cvd: { history: vi.fn() } as Record<string, any> | undefined,
    wallets: { classify: vi.fn() },
    liquidations: { levels: vi.fn(), levelsHistory: vi.fn(), history: vi.fn(), volume: vi.fn() },
    orders: { triggerLevels: vi.fn(), triggerLevelsHistory: vi.fn(), flow: vi.fn(), history: vi.fn() },
    l2Orderbook: { history: vi.fn() },
    oracle: { externalPrice: vi.fn(), discoveryBounds: vi.fn() },
  });
  const fresh = () => ({
    hyperliquid: {
      ...venue(),
      hip3: venue(),
      hip4: {
        questions: { list: vi.fn(), get: vi.fn() },
        outcomes: { getBySlug: vi.fn() } as Record<string, any>,
      },
    },
    lighter: { l3Orderbook: { get: vi.fn(), history: vi.fn() } },
    spot: {
      orders: { history: vi.fn() },
      trades: { list: vi.fn() },
      l4Orderbook: { get: vi.fn(), diffs: vi.fn(), history: vi.fn() },
    },
    symbols: { list: vi.fn() } as Record<string, any> | undefined,
    dataQuality: {
      status: vi.fn(),
      coverage: vi.fn(),
      exchangeCoverage: vi.fn(),
      symbolCoverage: vi.fn(),
      listIncidents: vi.fn(),
      getIncident: vi.fn(),
      latency: vi.fn(),
      sla: vi.fn(),
      positionsFreshness: vi.fn(),
    } as Record<string, any>,
  });
  const state = { clients: fresh(), apiKeys: [] as string[] };
  return {
    state,
    reset() {
      state.clients = fresh();
      state.apiKeys = [];
    },
  };
});

vi.mock('@0xarchive/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@0xarchive/sdk')>();
  class OxArchive {
    constructor(options: { apiKey: string }) {
      sdk.state.apiKeys.push(options.apiKey);
    }
    get hyperliquid() {
      return sdk.state.clients.hyperliquid;
    }
    get lighter() {
      return sdk.state.clients.lighter;
    }
    get spot() {
      return sdk.state.clients.spot;
    }
    get symbols() {
      return sdk.state.clients.symbols;
    }
    get dataQuality() {
      return sdk.state.clients.dataQuality;
    }
  }
  return { ...actual, OxArchive };
});

const BREADTH = {
  sessionDate: '2026-09-29',
  calculatedAt: '2026-09-29T03:35:00Z',
  valuePct: null,
  coverageRatio: 0,
  counts: {
    candidates: 244,
    eligible: 0,
    above: 0,
    at: 0,
    below: 0,
    excludedNoSessionVolume: 200,
    excludedStalePrice: 44,
  },
  namespaces: { eligible: {}, above: {}, at: {}, below: {} },
};

const START = '2026-09-01T00:00:00Z';
const END = '2026-09-02T00:00:00Z';
const START_MS = Date.parse(START);
const END_MS = Date.parse(END);

describe('new analytics commands', () => {
  let dir: string;

  beforeEach(() => {
    sdk.reset();
    captureIo();
    vi.stubEnv('OXA_API_KEY', 'test-key');
    dir = mkdtempSync(join(tmpdir(), 'oxa-analytics-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('oxa breadth', () => {
    it('reads HIP-3 breadth from the HIP-3 client and keeps a null percentage null', async () => {
      sdk.state.clients.hyperliquid.hip3.breadth!.current.mockResolvedValue(BREADTH);
      expect(await runCli('breadth', 'current', '--exchange', 'hip3')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.breadth!.current).toHaveBeenCalledWith();
      expect(stdoutJson()).toEqual(BREADTH);
      expect(stdoutJson().valuePct).toBeNull();
    });

    it('prints a null percentage as null, never 0, in pretty output', async () => {
      sdk.state.clients.hyperliquid.hip3.breadth!.current.mockResolvedValue(BREADTH);
      expect(await runCli('breadth', 'current', '--exchange', 'hip3', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toContain('Value %: null');
      expect(stdoutText()).not.toContain('Value %: 0');
    });

    it('reads Hyperliquid core breadth from the core client', async () => {
      sdk.state.clients.hyperliquid.breadth!.current.mockResolvedValue({ ...BREADTH, valuePct: 60.8 });
      expect(await runCli('breadth', 'current', '--exchange', 'hyperliquid')).toBe(0);
      expect(sdk.state.clients.hyperliquid.breadth!.current).toHaveBeenCalledWith();
      expect(sdk.state.clients.hyperliquid.hip3.breadth!.current).not.toHaveBeenCalled();
      expect(stdoutJson().valuePct).toBe(60.8);
    });

    it('pages history with the window, interval, limit, and cursor', async () => {
      sdk.state.clients.hyperliquid.breadth!.history.mockResolvedValue({ data: [BREADTH], nextCursor: '1790566920000' });
      const code = await runCli(
        'breadth', 'history', '--exchange', 'hyperliquid',
        '--start', START, '--end', END, '--interval', '1h', '--limit', '500', '--cursor', 'abc',
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.breadth!.history).toHaveBeenCalledWith({
        start: START_MS,
        end: END_MS,
        interval: '1h',
        limit: 500,
        cursor: 'abc',
      });
      expect(stdoutJson()).toEqual({ data: [BREADTH], nextCursor: '1790566920000' });
    });

    it('sends only the flags given', async () => {
      sdk.state.clients.hyperliquid.hip3.breadth!.history.mockResolvedValue({ data: [], nextCursor: undefined });
      expect(await runCli('breadth', 'history', '--exchange', 'hip3')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.breadth!.history).toHaveBeenCalledWith({});
      expect(stdoutJson()).toEqual({ data: [], nextCursor: null });
    });

    it('writes history to --out and prints a summary', async () => {
      const out = join(dir, 'breadth.json');
      sdk.state.clients.hyperliquid.hip3.breadth!.history.mockResolvedValue({ data: [BREADTH], nextCursor: 'next' });
      expect(await runCli('breadth', 'history', '--exchange', 'hip3', '--out', out)).toBe(0);
      expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ data: [BREADTH], nextCursor: 'next' });
      expect(stdoutJson()).toEqual({
        written_to: out,
        records: 1,
        exchange: 'hip3',
        has_more: true,
        nextCursor: 'next',
      });
    });

    it.each([
      [['--exchange', 'hip4'], 'Hyperliquid HIP-4 has no breadth endpoint. Use --exchange hyperliquid or hip3.'],
      [['--exchange', 'lighter'], 'Lighter has no breadth endpoint. Use --exchange hyperliquid or hip3.'],
      [['--exchange', 'hip3', '--limit', '1001'], '--limit must be a whole number from 1 to 1000 (got 1001)'],
      [['--exchange', 'hip3', '--interval', '2h'], 'Invalid interval "2h". Must be one of: 1m, 5m, 15m, 30m, 1h, 4h, 1d'],
      [['--exchange', 'hip3', '--start', END, '--end', START], '--start must be before --end'],
    ])('refuses %j before any request', async (flags, message) => {
      expect(await runCli('breadth', 'history', ...flags)).toBe(2);
      expect(lastError()).toEqual({ error: message, code: 2, type: 'validation' });
      expect(sdk.state.clients.hyperliquid.hip3.breadth!.history).not.toHaveBeenCalled();
      expect(sdk.state.clients.hyperliquid.breadth!.history).not.toHaveBeenCalled();
    });

    it.each([
      ['hip3', 'Hyperliquid HIP-3'],
      ['hyperliquid', 'Hyperliquid'],
    ])('names the SDK floor when the installed SDK has no %s breadth', async (exchange, label) => {
      if (exchange === 'hip3') sdk.state.clients.hyperliquid.hip3.breadth = undefined;
      else sdk.state.clients.hyperliquid.breadth = undefined;
      expect(await runCli('breadth', 'current', '--exchange', exchange)).toBe(5);
      expect(lastError().error).toBe(
        `Support for ${label} breadth requires @0xarchive/sdk 1.12.0 or newer. Reinstall @0xarchive/cli to pick it up.`,
      );
    });
  });

  describe('oxa cvd', () => {
    const BUCKET = { timestamp: 1790647200000, buyVolume: 10, sellVolume: 4, delta: 6, cumulativeDelta: 6 };

    it('calls the core CVD resource with the window and cursor', async () => {
      sdk.state.clients.hyperliquid.cvd!.history.mockResolvedValue({
        data: [BUCKET],
        nextCursor: '1790650800000',
        meta: { count: 1, requestId: 'r', notice: 'cumulative_delta runs from the first bucket of this page' },
      });
      const code = await runCli(
        'cvd', 'BTC', '--exchange', 'hyperliquid',
        '--start', START, '--end', END, '--interval', '5m', '--limit', '10000', '--cursor', '1790647200000',
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.cvd!.history).toHaveBeenCalledWith('BTC', {
        start: START_MS,
        end: END_MS,
        interval: '5m',
        limit: 10000,
        cursor: '1790647200000',
      });
      expect(stdoutJson()).toEqual({
        data: [BUCKET],
        nextCursor: '1790650800000',
        meta: { notice: 'cumulative_delta runs from the first bucket of this page' },
      });
    });

    it('routes HIP-3 symbols to the HIP-3 client unchanged and accepts 1w', async () => {
      sdk.state.clients.hyperliquid.hip3.cvd!.history.mockResolvedValue({ data: [], nextCursor: undefined });
      expect(await runCli('cvd', 'km:US500', '--exchange', 'hip3', '--interval', '1w')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.cvd!.history).toHaveBeenCalledWith('km:US500', { interval: '1w' });
      expect(stdoutJson()).toEqual({ data: [], nextCursor: null });
    });

    it('prints buckets in UTC and says the running total restarts per page', async () => {
      sdk.state.clients.hyperliquid.cvd!.history.mockResolvedValue({ data: [BUCKET], nextCursor: undefined });
      expect(await runCli('cvd', 'BTC', '--exchange', 'hyperliquid', '--format', 'pretty')).toBe(0);
      const text = stdoutText();
      expect(text).toContain('2026-09-29T02:00:00.000Z');
      expect(text).toContain('Cumulative delta restarts on every page');
    });

    it.each([
      [['--exchange', 'lighter'], 'Lighter has no CVD endpoint. Use --exchange hyperliquid or hip3.'],
      [['--exchange', 'hyperliquid', '--limit', '10001'], '--limit must be a whole number from 1 to 10000 (got 10001)'],
      [
        ['--exchange', 'hyperliquid', '--interval', '2h'],
        'Invalid interval "2h". Must be one of: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w',
      ],
    ])('refuses %j before any request', async (flags, message) => {
      expect(await runCli('cvd', 'BTC', ...flags)).toBe(2);
      expect(lastError().error).toBe(message);
      expect(sdk.state.clients.hyperliquid.cvd!.history).not.toHaveBeenCalled();
    });
  });

  describe('oxa hip3 oracle', () => {
    it('reads the external price', async () => {
      const price = { symbol: 'km:US500', externalPrice: 749.64, markPrice: null, blockNumber: 1, timestamp: 1790653164010 };
      sdk.state.clients.hyperliquid.hip3.oracle.externalPrice.mockResolvedValue(price);
      expect(await runCli('hip3', 'oracle', 'external-price', 'km:US500')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.oracle.externalPrice).toHaveBeenCalledWith('km:US500');
      expect(stdoutJson()).toEqual(price);
    });

    it('prints a missing mark price as null', async () => {
      sdk.state.clients.hyperliquid.hip3.oracle.externalPrice.mockResolvedValue({
        symbol: 'km:US500',
        externalPrice: 749.64,
        markPrice: null,
        blockNumber: 1,
        timestamp: 1790653164010,
      });
      expect(await runCli('hip3', 'oracle', 'external-price', 'km:US500', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toContain('Mark price: null');
    });

    it('reads the discovery bounds', async () => {
      const bounds = {
        symbol: 'km:US500',
        referencePrice: 749.64,
        referenceSource: 'external',
        maxLeverage: 25,
        boundFraction: 0.04,
        lowerBound: 719.6544,
        upperBound: 779.6256,
        blockNumber: 1,
        timestamp: 1790653164010,
      };
      sdk.state.clients.hyperliquid.hip3.oracle.discoveryBounds.mockResolvedValue(bounds);
      expect(await runCli('hip3', 'oracle', 'discovery-bounds', 'km:US500', '--format', 'pretty')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.oracle.discoveryBounds).toHaveBeenCalledWith('km:US500');
      expect(stdoutText()).toContain('Lower bound: 719.6544');
      expect(stdoutText()).toContain('Reference source: external');
    });
  });

  describe('oxa hip4 questions', () => {
    const QUESTION = {
      questionId: 1,
      name: 'Recurring',
      description: 'class:priceBucket|underlying:BTC',
      fallbackOutcomeId: 11,
      namedOutcomeIds: [12, 13, 14],
      settledNamedOutcomes: [],
      firstSeenAt: '2026-05-09T05:57:28.335Z',
      lastUpdatedAt: '2026-05-09T05:57:28.335Z',
    };

    it('lists one page with limit and cursor', async () => {
      sdk.state.clients.hyperliquid.hip4.questions.list.mockResolvedValue({ data: [QUESTION], nextCursor: '1' });
      expect(await runCli('hip4', 'questions', 'list', '--limit', '2', '--cursor', '0')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip4.questions.list).toHaveBeenCalledWith({ limit: 2, cursor: '0' });
      expect(stdoutJson()).toEqual({ data: [QUESTION], nextCursor: '1' });
    });

    it('gets one question by id', async () => {
      sdk.state.clients.hyperliquid.hip4.questions.get.mockResolvedValue(QUESTION);
      expect(await runCli('hip4', 'questions', 'get', '1', '--format', 'pretty')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip4.questions.get).toHaveBeenCalledWith(1);
      expect(stdoutText()).toContain('Named outcomes: 12, 13, 14');
      expect(stdoutText()).toContain('Settled named outcomes: none');
    });

    it('refuses a non-numeric id and an out-of-range limit', async () => {
      expect(await runCli('hip4', 'questions', 'get', 'abc')).toBe(2);
      expect(lastError().error).toBe('Invalid question_id "abc". Must be a non-negative integer.');
      expect(await runCli('hip4', 'questions', 'list', '--limit', '1001')).toBe(2);
      expect(lastError().error).toBe('--limit must be a whole number from 1 to 1000 (got 1001)');
      expect(sdk.state.clients.hyperliquid.hip4.questions.get).not.toHaveBeenCalled();
      expect(sdk.state.clients.hyperliquid.hip4.questions.list).not.toHaveBeenCalled();
    });
  });

  describe('oxa wallets classify', () => {
    const PAGE = {
      wallets: [
        {
          address: '0x1111111111111111111111111111111111111111',
          metrics: { totalOrders: 5000, totalFills: 40, totalVolumeUsd: 1.5e6, makerRatio: 0.9, cancelRate: 0.4 },
          period: '24h',
        },
      ],
      total: 3,
      date: '2026-09-28',
    };

    it('maps every filter to the API parameter names', async () => {
      sdk.state.clients.hyperliquid.wallets.classify.mockResolvedValue(PAGE);
      const code = await runCli(
        'wallets', 'classify', '--exchange', 'hyperliquid',
        '--min-orders', '1000', '--min-volume-usd', '250000.5', '--sort', 'total_volume_usd', '--order', 'asc',
        '--uses-twap', 'true', '--uses-priority-gas', 'false', '--min-cancel-rate', '0.1', '--max-cancel-rate', '0.5',
        '--date', '2026-09-28', '--limit', '1000', '--offset', '100000',
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.wallets.classify).toHaveBeenCalledWith({
        min_orders: 1000,
        min_volume_usd: 250000.5,
        sort: 'total_volume_usd',
        order: 'asc',
        uses_twap: true,
        uses_priority_gas: false,
        min_cancel_rate: 0.1,
        max_cancel_rate: 0.5,
        date: '2026-09-28',
        limit: 1000,
        offset: 100000,
      });
      expect(stdoutJson()).toEqual(PAGE);
    });

    it('routes HIP-3 to the HIP-3 client with no filters by default', async () => {
      sdk.state.clients.hyperliquid.hip3.wallets.classify.mockResolvedValue(PAGE);
      expect(await runCli('wallets', 'classify', '--exchange', 'hip3')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.wallets.classify).toHaveBeenCalledWith({});
    });

    it('points to the next offset in pretty output', async () => {
      sdk.state.clients.hyperliquid.wallets.classify.mockResolvedValue(PAGE);
      expect(await runCli('wallets', 'classify', '--exchange', 'hyperliquid', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toContain('0x1111...1111');
      expect(stdoutText()).toContain('More wallets match (use --offset 1 to page)');
    });

    it.each([
      [['--sort', 'volume'], /^Invalid --sort "volume"\. Must be total_orders, /],
      [['--order', 'up'], /^Invalid --order "up"\. Must be asc or desc\.$/],
      [['--uses-twap', 'yes'], /^--uses-twap must be true or false \(got yes\)$/],
      [['--max-cancel-rate', '1.5'], /^--max-cancel-rate must be a number from 0 to 1 \(got 1\.5\)$/],
      [['--min-cancel-rate', '0.6', '--max-cancel-rate', '0.5'], /^--min-cancel-rate must not be above --max-cancel-rate$/],
      [['--offset', '100001'], /^--offset must be a whole number from 0 to 100000 \(got 100001\)$/],
      [['--date', '2026-9-1'], /^--date must be a UTC date as YYYY-MM-DD \(got 2026-9-1\)$/],
      [['--min-orders', '-1'], /^--min-orders must be a non-negative whole number \(got -1\)$/],
    ])('refuses %j before any request', async (flags, message) => {
      expect(await runCli('wallets', 'classify', '--exchange', 'hyperliquid', ...flags)).toBe(2);
      expect(lastError().error).toMatch(message);
      expect(sdk.state.clients.hyperliquid.wallets.classify).not.toHaveBeenCalled();
    });

    it('refuses venues without wallet classification', async () => {
      expect(await runCli('wallets', 'classify', '--exchange', 'hip4')).toBe(2);
      expect(lastError().error).toBe(
        'Hyperliquid HIP-4 has no wallet classification endpoint. Use --exchange hyperliquid or hip3.',
      );
    });
  });

  describe('oxa symbols', () => {
    const ENTRIES = [
      { symbol: 'BTC', exchange: 'hyperliquid', dataTypes: ['trades'], coverageFrom: '2023-04-15T00:00:00Z' },
      { symbol: 'BTC', exchange: 'lighter', dataTypes: ['trades'] },
      { symbol: 'km:US500', exchange: 'hip3', dataTypes: ['trades'] },
      { symbol: '#0', exchange: 'hip4', dataTypes: ['trades'], isSettled: true },
    ];

    it('prints the whole list by default', async () => {
      sdk.state.clients.symbols!.list.mockResolvedValue(ENTRIES);
      expect(await runCli('symbols')).toBe(0);
      expect(sdk.state.clients.symbols!.list).toHaveBeenCalledWith();
      expect(stdoutJson()).toEqual(ENTRIES);
    });

    it.each([
      [['--exchange', 'hyperliquid'], [ENTRIES[0]]],
      [['--symbol', 'BTC'], [ENTRIES[0], ENTRIES[1]]],
      [['--exchange', 'lighter', '--symbol', 'BTC'], [ENTRIES[1]]],
      [['--symbol', 'km:US500'], [ENTRIES[2]]],
      [['--exchange', 'hip4', '--symbol', '0'], [ENTRIES[3]]],
      [['--symbol', 'ETH'], []],
    ])('filters locally with %j', async (flags, expected) => {
      sdk.state.clients.symbols!.list.mockResolvedValue(ENTRIES);
      expect(await runCli('symbols', ...flags)).toBe(0);
      expect(stdoutJson()).toEqual(expected);
    });

    it('writes the filtered list to --out', async () => {
      const out = join(dir, 'symbols.json');
      sdk.state.clients.symbols!.list.mockResolvedValue(ENTRIES);
      expect(await runCli('symbols', '--exchange', 'hip3', '--out', out)).toBe(0);
      expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual([ENTRIES[2]]);
      expect(stdoutJson()).toEqual({ written_to: out, records: 1, exchange: 'hip3' });
    });

    it('refuses an unknown venue family', async () => {
      expect(await runCli('symbols', '--exchange', 'binance')).toBe(2);
      expect(lastError().error).toBe(
        'Invalid --exchange "binance". Must be hyperliquid, hip3, hip4, spot, lighter, or rh-lighter.',
      );
      expect(sdk.state.clients.symbols!.list).not.toHaveBeenCalled();
    });

    it('names the SDK floor when the installed SDK has no symbol list', async () => {
      sdk.state.clients.symbols = undefined;
      expect(await runCli('symbols')).toBe(5);
      expect(lastError().error).toMatch(/^Support for the symbol list requires @0xarchive\/sdk 1\.12\.0 or newer/);
    });
  });

  describe('oxa liquidations levels', () => {
    const LEVELS = {
      midPrice: 83135,
      snapshotTs: '2026-09-29 03:36:48.000',
      blockNumber: 1164910000,
      totalLong: 1e9,
      totalShort: 1e9,
      flaggedNotional: 1e8,
      levels: [{ price: 81638.57, longNotional: 2.5e7, shortNotional: 0, longCount: 402, shortCount: 0 }],
    };

    it('reads current levels with the bucket flags and a point in time', async () => {
      sdk.state.clients.hyperliquid.liquidations.levels.mockResolvedValue(LEVELS);
      const code = await runCli(
        'liquidations', 'levels', '--exchange', 'hyperliquid', '--symbol', 'BTC',
        '--range-pct', '2.5', '--buckets', '20', '--side', 'B', '--at', START,
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.liquidations.levels).toHaveBeenCalledWith('BTC', {
        range_pct: 2.5,
        buckets: 20,
        side: 'B',
        at: START_MS,
      });
      expect(stdoutJson()).toEqual(LEVELS);
    });

    it('reads HIP-3 levels history with summary and paging', async () => {
      sdk.state.clients.hyperliquid.hip3.liquidations.levelsHistory.mockResolvedValue({
        data: [{ snapshotTs: '2026-09-01 00:00:00.000', midPrice: 1 }],
        nextCursor: '1790000000000',
      });
      const code = await runCli(
        'liquidations', 'levels-history', '--exchange', 'hip3', '--symbol', 'xyz:TSLA',
        '--start', START, '--end', END, '--summary', '--limit', '100', '--cursor', 'c1',
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.liquidations.levelsHistory).toHaveBeenCalledWith('xyz:TSLA', {
        start: START_MS,
        end: END_MS,
        limit: 100,
        cursor: 'c1',
        summary: true,
      });
      expect(stdoutJson()).toEqual({
        data: [{ snapshotTs: '2026-09-01 00:00:00.000', midPrice: 1 }],
        nextCursor: '1790000000000',
      });
    });

    it('prints the price buckets', async () => {
      sdk.state.clients.hyperliquid.liquidations.levels.mockResolvedValue(LEVELS);
      expect(await runCli('liquidations', 'levels', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toContain('81638.57');
      expect(stdoutText()).toContain('Snapshot: 2026-09-29 03:36:48.000');
    });

    it.each([
      [['--exchange', 'lighter'], 'Lighter has no liquidation levels endpoint. Use --exchange hyperliquid or hip3.'],
      [['--exchange', 'hyperliquid', '--range-pct', '60'], '--range-pct must be a number from 1 to 50 (got 60)'],
      [['--exchange', 'hyperliquid', '--buckets', '5'], '--buckets must be a whole number from 10 to 200 (got 5)'],
      [['--exchange', 'hyperliquid', '--side', 'long'], 'Invalid --side "long". Must be bid, ask, buy, sell, B, or A.'],
    ])('refuses %j before any request', async (flags, message) => {
      expect(await runCli('liquidations', 'levels', '--symbol', 'BTC', ...flags)).toBe(2);
      expect(lastError().error).toBe(message);
      expect(sdk.state.clients.hyperliquid.liquidations.levels).not.toHaveBeenCalled();
    });

    it('caps a history page at 100 snapshots', async () => {
      expect(
        await runCli('liquidations', 'levels-history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--limit', '101'),
      ).toBe(2);
      expect(lastError().error).toBe('--limit must be a whole number from 1 to 100 (got 101)');
    });
  });

  describe('oxa orders trigger-levels', () => {
    const TRIGGERS = {
      midPrice: 83097,
      asOf: '2026-09-29T03:40:22Z',
      totalBidSize: 157.6,
      totalAskSize: 290.8,
      levels: [{ priceBucket: 81400, bidCount: 108, bidSize: 12.1, askCount: 261, askSize: 35.6 }],
    };

    it('reads the current trigger map on HIP-3', async () => {
      sdk.state.clients.hyperliquid.hip3.orders.triggerLevels.mockResolvedValue(TRIGGERS);
      const code = await runCli(
        'orders', 'trigger-levels', '--exchange', 'hip3', '--symbol', 'xyz:TSLA', '--buckets', '10', '--side', 'ask',
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.orders.triggerLevels).toHaveBeenCalledWith('xyz:TSLA', {
        buckets: 10,
        side: 'ask',
      });
      expect(stdoutJson()).toEqual(TRIGGERS);
    });

    it('pages trigger-levels history and writes --out', async () => {
      const out = join(dir, 'triggers.json');
      sdk.state.clients.hyperliquid.orders.triggerLevelsHistory.mockResolvedValue({
        data: [{ snapshotTs: '2026-09-28 04:00:01.000', midPrice: 83296 }],
        nextCursor: undefined,
      });
      const code = await runCli(
        'orders', 'trigger-levels-history', '--exchange', 'hyperliquid', '--symbol', 'BTC',
        '--range-pct', '5', '--out', out,
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.orders.triggerLevelsHistory).toHaveBeenCalledWith('BTC', { range_pct: 5 });
      expect(JSON.parse(readFileSync(out, 'utf8')).nextCursor).toBeNull();
      expect(stdoutJson()).toMatchObject({ written_to: out, records: 1, exchange: 'hyperliquid', has_more: false });
    });

    it('prints the price buckets', async () => {
      sdk.state.clients.hyperliquid.orders.triggerLevels.mockResolvedValue(TRIGGERS);
      expect(await runCli('orders', 'trigger-levels', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toContain('81400');
      expect(stdoutText()).toContain('As of: 2026-09-29T03:40:22Z');
    });

    it('refuses HIP-4, which has no trigger levels', async () => {
      expect(await runCli('orders', 'trigger-levels', '--exchange', 'hip4', '--symbol', '0')).toBe(2);
      expect(lastError().error).toBe(
        'Hyperliquid HIP-4 has no trigger levels endpoint. Use --exchange hyperliquid or hip3.',
      );
    });
  });

  describe('order flow paging', () => {
    it('reports has_more and nextCursor with --out', async () => {
      const out = join(dir, 'flow.json');
      sdk.state.clients.hyperliquid.orders.flow.mockResolvedValue({ data: [{ timestamp: 1 }], nextCursor: '1783960740000' });
      const code = await runCli(
        'orders', 'flow', '--exchange', 'hyperliquid', '--symbol', 'BTC',
        '--start', START, '--end', END, '--interval', '1m', '--cursor', '1783900800000', '--out', out,
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.orders.flow).toHaveBeenCalledWith('BTC', {
        start: START_MS,
        end: END_MS,
        interval: '1m',
        cursor: '1783900800000',
      });
      expect(stdoutJson()).toEqual({
        written_to: out,
        records: 1,
        exchange: 'hyperliquid',
        symbol: 'BTC',
        has_more: true,
        nextCursor: '1783960740000',
      });
    });
  });

  describe('oxa data-quality', () => {
    const dq = () => sdk.state.clients.dataQuality;

    it('prints the platform status', async () => {
      const status = {
        status: 'degraded',
        updatedAt: '2026-09-29T04:25:00Z',
        exchanges: { hyperliquid: { status: 'operational', lastDataAt: '2026-09-29T04:25:00Z', latencyMs: 381 } },
        dataTypes: { funding: { status: 'degraded', completeness24h: 99 } },
        activeIncidents: 0,
      };
      dq().status.mockResolvedValue(status);
      expect(await runCli('data-quality', 'status')).toBe(0);
      expect(dq().status).toHaveBeenCalledWith();
      expect(stdoutJson()).toEqual(status);

      vi.mocked(process.stdout.write).mockClear();
      expect(await runCli('data-quality', 'status', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toContain('Data Quality Status: degraded');
      expect(stdoutText()).toMatch(/hyperliquid\s+operational\s+2026-09-29T04:25:00Z\s+381/);
      expect(stdoutText()).toMatch(/funding\s+degraded\s+99/);
    });

    it('reads coverage for every venue, one venue, or one symbol', async () => {
      const all = { exchanges: [{ exchange: 'hip3', dataTypes: { orderbook: { earliest: 'a', latest: 'b', totalRecords: 5, symbols: 2, completeness: 100 } } }] };
      dq().coverage.mockResolvedValue(all);
      expect(await runCli('data-quality', 'coverage')).toBe(0);
      expect(dq().coverage).toHaveBeenCalledWith();
      expect(stdoutJson()).toEqual(all);

      dq().exchangeCoverage.mockResolvedValue(all.exchanges[0]);
      expect(await runCli('data-quality', 'coverage', '--exchange', 'hip3', '--format', 'pretty')).toBe(0);
      expect(dq().exchangeCoverage).toHaveBeenCalledWith('hip3');
      expect(stdoutText()).toMatch(/hip3\s+orderbook\s+a\s+b\s+5\s+2\s+100/);

      dq().symbolCoverage.mockResolvedValue({ exchange: 'hip3', symbol: 'km:US500', dataTypes: {} });
      expect(await runCli('data-quality', 'coverage', '--exchange', 'hip3', '--symbol', 'km:US500')).toBe(0);
      expect(dq().symbolCoverage).toHaveBeenLastCalledWith('hip3', 'km:US500', undefined);

      expect(
        await runCli('data-quality', 'coverage', '--exchange', 'hip4', '--symbol', '#0', '--from', START, '--to', END),
      ).toBe(0);
      expect(dq().symbolCoverage).toHaveBeenLastCalledWith('hip4', '#0', { from: START_MS, to: END_MS });
    });

    it('prints gap counts and cadence for one symbol', async () => {
      dq().symbolCoverage.mockResolvedValue({
        exchange: 'hyperliquid',
        symbol: 'BTC',
        dataTypes: {
          orderbook: {
            earliest: '2023-04-15T00:00:07Z',
            latest: '2026-09-29T04:25:01Z',
            totalRecords: 195276209,
            completeness: 100,
            historicalCoverage: 98.4,
            gaps: [{ start: 'x', end: 'y', durationMinutes: 3 }],
            cadence: { medianIntervalSeconds: 1, p95IntervalSeconds: 1, sampleCount: 83204 },
          },
        },
      });
      expect(await runCli('data-quality', 'coverage', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toMatch(/orderbook\s+2023-04-15T00:00:07Z\s+2026-09-29T04:25:01Z\s+195276209\s+100\s+98\.4\s+1\s+1/);
    });

    it.each([
      [['--symbol', 'BTC'], /^--symbol needs --exchange/],
      [['--exchange', 'hyperliquid', '--from', START], /^--from and --to bound the gap search of one symbol/],
      [['--exchange', 'binance'], /^Invalid --exchange "binance"/],
      [['--exchange', 'hyperliquid', '--symbol', 'BTC', '--from', END, '--to', START], /^--from must be before --to$/],
    ])('refuses coverage %j before any request', async (flags, message) => {
      expect(await runCli('data-quality', 'coverage', ...flags)).toBe(2);
      expect(lastError().error).toMatch(message);
      expect(dq().coverage).not.toHaveBeenCalled();
      expect(dq().exchangeCoverage).not.toHaveBeenCalled();
      expect(dq().symbolCoverage).not.toHaveBeenCalled();
    });

    it('lists incidents with filters and offset paging', async () => {
      const result = {
        incidents: [{ id: 'INC-2026-001', status: 'resolved', severity: 'major', exchange: 'lighter', title: 'Upstream outage', startedAt: 's' }],
        pagination: { total: 3, limit: 1, offset: 0 },
      };
      dq().listIncidents.mockResolvedValue(result);
      const code = await runCli(
        'data-quality', 'incidents', '--status', 'resolved', '--exchange', 'lighter', '--since', START,
        '--limit', '1', '--offset', '0',
      );
      expect(code).toBe(0);
      expect(dq().listIncidents).toHaveBeenCalledWith({
        status: 'resolved',
        exchange: 'lighter',
        since: START_MS,
        limit: 1,
        offset: 0,
      });
      expect(stdoutJson()).toEqual(result);

      vi.mocked(process.stdout.write).mockClear();
      expect(await runCli('data-quality', 'incidents', '--format', 'pretty')).toBe(0);
      expect(dq().listIncidents).toHaveBeenLastCalledWith(undefined);
      expect(stdoutText()).toContain('Data Quality Incidents, 1 of 3');
      expect(stdoutText()).toContain('More incidents match (use --offset 1 to page)');
    });

    it.each([
      [['--status', 'closed'], /^Invalid --status "closed"\. Must be open, investigating, identified, monitoring, or resolved\.$/],
      [['--limit', '101'], /^--limit must be a whole number from 1 to 100 \(got 101\)$/],
      [['--offset', '-1'], /^--offset must be a non-negative whole number \(got -1\)$/],
    ])('refuses incidents %j before any request', async (flags, message) => {
      expect(await runCli('data-quality', 'incidents', ...flags)).toBe(2);
      expect(lastError().error).toMatch(message);
      expect(dq().listIncidents).not.toHaveBeenCalled();
    });

    it('gets one incident', async () => {
      const incident = { id: 'INC-2026-001', status: 'resolved', severity: 'major', title: 'Upstream outage', rootCause: 'Venue outage' };
      dq().getIncident.mockResolvedValue(incident);
      expect(await runCli('data-quality', 'incident', 'INC-2026-001', '--format', 'pretty')).toBe(0);
      expect(dq().getIncident).toHaveBeenCalledWith('INC-2026-001');
      expect(stdoutText()).toContain('Root cause: Venue outage');
    });

    it('prints latency per venue', async () => {
      dq().latency.mockResolvedValue({
        measuredAt: 'now',
        exchanges: {
          hyperliquid: {
            websocket: { currentMs: 470 },
            restApi: { currentMs: 66, avg1hMs: 40 },
            dataFreshness: { orderbookLagMs: 470, fillsLagMs: 41914 },
          },
        },
      });
      expect(await runCli('data-quality', 'latency', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toMatch(/hyperliquid\s+470\s+66\s+40\s+470\s+41914\s+-\s+-/);
    });

    it('reads SLA for a month', async () => {
      const sla = {
        period: '2026-08',
        slaTargets: { uptime: 99.9, dataCompleteness: 99.5, apiLatencyP99Ms: 500 },
        actual: {
          uptime: 100,
          uptimeStatus: 'met',
          dataCompleteness: { orderbook: 99, funding: 99, overall: 99.6 },
          completenessStatus: 'met',
          apiLatencyP99Ms: 279,
          latencyStatus: 'met',
        },
        incidentsThisPeriod: 0,
        totalDowntimeMinutes: 0,
      };
      dq().sla.mockResolvedValue(sla);
      expect(await runCli('data-quality', 'sla', '--year', '2026', '--month', '8', '--format', 'pretty')).toBe(0);
      expect(dq().sla).toHaveBeenCalledWith({ year: 2026, month: 8 });
      expect(stdoutText()).toContain('Uptime: 100% against 99.9% (met)');
      expect(stdoutText()).toContain('API latency p99: 279 ms against 500 ms (met)');

      expect(await runCli('data-quality', 'sla')).toBe(0);
      expect(dq().sla).toHaveBeenLastCalledWith(undefined);
      expect(await runCli('data-quality', 'sla', '--month', '13')).toBe(2);
      expect(lastError().error).toBe('--month must be a whole number from 1 to 12 (got 13)');
    });

    it('reads positions freshness per venue', async () => {
      const venues = [
        {
          venue: 'hyperliquid',
          product: 'core',
          liveSnapshotTs: '2026-09-29T04:22:28Z',
          liveAgeSeconds: 161,
          stale: false,
          liveQuality: 'complete',
          hourlySnapshotTs: '2026-09-29T04:00:00Z',
          builtThrough: '2026-09-29T04:00:00Z',
          finalizedThrough: null,
        },
      ];
      dq().positionsFreshness.mockResolvedValue(venues);
      expect(await runCli('data-quality', 'positions-freshness')).toBe(0);
      expect(stdoutJson()).toEqual(venues);

      vi.mocked(process.stdout.write).mockClear();
      expect(await runCli('data-quality', 'positions-freshness', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toMatch(/hyperliquid\s+core\s+2026-09-29T04:22:28Z\s+161\s+no\s+complete/);
    });

    it('names the SDK floor when positions freshness is missing', async () => {
      delete dq().positionsFreshness;
      expect(await runCli('data-quality', 'positions-freshness')).toBe(5);
      expect(lastError().error).toMatch(/^Support for positions freshness requires @0xarchive\/sdk 1\.12\.0 or newer/);
    });
  });

  describe('oxa spot l4-diffs and l4-history', () => {
    it.each([
      ['l4-diffs', 'diffs'],
      ['l4-history', 'history'],
    ])('%s pages the Spot L4 %s', async (command, method) => {
      const l4 = sdk.state.clients.spot.l4Orderbook as Record<string, any>;
      l4[method].mockResolvedValue({ data: [{ seq: 1 }], nextCursor: 'next' });
      const code = await runCli(
        'spot', command, 'HYPE-USDC', '--start', START, '--end', END, '--limit', '100', '--cursor', 'c1',
      );
      expect(code).toBe(0);
      expect(l4[method]).toHaveBeenCalledWith('HYPE-USDC', { start: START_MS, end: END_MS, limit: 100, cursor: 'c1' });
      expect(stdoutJson()).toEqual({ data: [{ seq: 1 }], nextCursor: 'next' });
    });

    it('writes --out and refuses a reversed window', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'oxa-spot-l4-'));
      try {
        const out = join(dir, 'diffs.json');
        sdk.state.clients.spot.l4Orderbook.diffs.mockResolvedValue({ data: [], nextCursor: undefined });
        expect(await runCli('spot', 'l4-diffs', 'HYPE-USDC', '--start', START, '--end', END, '--out', out)).toBe(0);
        expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ data: [], nextCursor: null });
        expect(stdoutJson()).toMatchObject({ written_to: out, records: 0, exchange: 'spot', symbol: 'HYPE-USDC', has_more: false });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      expect(await runCli('spot', 'l4-history', 'HYPE-USDC', '--start', END, '--end', START)).toBe(2);
      expect(lastError().error).toBe('--start must be before --end');
      expect(sdk.state.clients.spot.l4Orderbook.history).not.toHaveBeenCalled();
    });
  });

  describe('HIP-4 outcome by slug', () => {
    const OUTCOME = {
      outcomeId: 104,
      name: 'June Fed rate change',
      sideSpecs: [
        { side: 0, name: 'Change', coin: '#1040', slug: 'june-fed-rate-change-change' },
        { side: 1, name: 'No Change', coin: '#1041', slug: 'june-fed-rate-change-no change' },
      ],
    };

    it.each([
      [['hip4', 'outcomes', 'by-slug'], 'btc-above-78213-may-03-0600', 'btc-above-78213-may-03-0600'],
      [['outcomes', 'by-slug'], 'eth-above-1863.4-yes-aug-05-0600', 'eth-above-1863.4-yes-aug-05-0600'],
      [['hip4', 'outcomes', 'by-slug'], 'june-fed-rate-change-no change', 'june-fed-rate-change-no%20change'],
      [['hip4', 'outcomes', 'by-slug'], 'template-pricetouch-template:yes', 'template-pricetouch-template%3Ayes'],
    ])('%j %s looks the outcome up by its encoded slug', async (command, slug, sent) => {
      sdk.state.clients.hyperliquid.hip4.outcomes.getBySlug.mockResolvedValue(OUTCOME);
      expect(await runCli(...command, slug)).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip4.outcomes.getBySlug).toHaveBeenCalledWith(sent);
      expect(stdoutJson()).toEqual(OUTCOME);
    });

    it('prints both sides with their slugs', async () => {
      sdk.state.clients.hyperliquid.hip4.outcomes.getBySlug.mockResolvedValue(OUTCOME);
      expect(await runCli('hip4', 'outcomes', 'by-slug', 'june-fed-rate-change-change', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toContain('HIP-4 Outcome 104');
      expect(stdoutText()).toMatch(/1\s+No Change\s+#1041\s+june-fed-rate-change-no change/);
    });

    it('refuses an empty slug', async () => {
      expect(await runCli('hip4', 'outcomes', 'by-slug', ' ')).toBe(2);
      expect(lastError().error).toBe('A slug is required, e.g. btc-above-78213-may-03-0600.');
      expect(sdk.state.clients.hyperliquid.hip4.outcomes.getBySlug).not.toHaveBeenCalled();
    });
  });

  describe('Lighter L3 --account', () => {
    it('filters the snapshot and the history to one account index', async () => {
      sdk.state.clients.lighter.l3Orderbook.get.mockResolvedValue({ orders: [] });
      sdk.state.clients.lighter.l3Orderbook.history.mockResolvedValue({ data: [], nextCursor: undefined });
      expect(await runCli('l3', 'get', '--symbol', 'BTC', '--account', '277239', '--depth', '10')).toBe(0);
      expect(sdk.state.clients.lighter.l3Orderbook.get).toHaveBeenCalledWith('BTC', { depth: 10, account: 277239 });
      expect(await runCli('l3', 'history', '--symbol', 'BTC', '--start', START, '--end', END, '--account', '0')).toBe(0);
      expect(sdk.state.clients.lighter.l3Orderbook.history).toHaveBeenCalledWith('BTC', {
        start: START_MS,
        end: END_MS,
        account: 0,
      });
    });

    it('reads a historical snapshot with --timestamp', async () => {
      sdk.state.clients.lighter.l3Orderbook.get.mockResolvedValue({ orders: [] });
      expect(await runCli('l3', 'get', '--symbol', 'BTC', '--timestamp', START, '--account', '5')).toBe(0);
      expect(sdk.state.clients.lighter.l3Orderbook.get).toHaveBeenCalledWith('BTC', { timestamp: START_MS, account: 5 });
      expect(await runCli('l3', 'get', '--symbol', 'BTC', '--timestamp', 'yesterday')).toBe(2);
      expect(lastError().error).toBe('--timestamp must be a valid ISO date or Unix timestamp (ms)');
    });

    it('sends no params when no filter is given', async () => {
      sdk.state.clients.lighter.l3Orderbook.get.mockResolvedValue({ orders: [] });
      expect(await runCli('l3', 'get', '--symbol', 'BTC')).toBe(0);
      expect(sdk.state.clients.lighter.l3Orderbook.get).toHaveBeenCalledWith('BTC', undefined);
    });

    it('refuses an account that is not an index', async () => {
      expect(await runCli('l3', 'get', '--symbol', 'BTC', '--account', '0xabc')).toBe(2);
      expect(lastError().error).toBe('--account must be a Lighter account index, a non-negative whole number (got 0xabc)');
    });
  });

  describe('flags the API ignores are gone', () => {
    it.each([
      [['l2', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END, '--depth', '5'], '--depth'],
      [['l3', 'history', '--symbol', 'BTC', '--start', START, '--end', END, '--depth', '5'], '--depth'],
      [['spot', 'orders', 'HYPE-USDC', '--start', START, '--end', END, '--user', '0xabc'], '--user'],
      [['spot', 'orders', 'HYPE-USDC', '--start', START, '--end', END, '--status', 'open'], '--status'],
      [['spot', 'orders', 'HYPE-USDC', '--start', START, '--end', END, '--order-type', 'limit'], '--order-type'],
      [['spot', 'trades', 'HYPE-USDC', '--start', START, '--end', END, '--user', '0xabc'], '--user'],
    ])('%j is refused as an unknown option', async (args, flag) => {
      expect(await runCli(...args)).toBe(1);
      expect(stderrText()).toContain(`unknown option '${flag}'`);
    });

    it('still sends spot order history with the range and cursor only', async () => {
      sdk.state.clients.spot.orders.history.mockResolvedValue({ data: [], nextCursor: undefined });
      expect(await runCli('spot', 'orders', 'HYPE-USDC', '--start', START, '--end', END, '--cursor', 'c')).toBe(0);
      expect(sdk.state.clients.spot.orders.history).toHaveBeenCalledWith('HYPE-USDC', {
        start: START_MS,
        end: END_MS,
        cursor: 'c',
      });
    });

    it('still sends full-depth L2 history without depth', async () => {
      sdk.state.clients.hyperliquid.l2Orderbook.history.mockResolvedValue({ data: [], nextCursor: undefined });
      expect(
        await runCli('l2', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END),
      ).toBe(0);
      expect(sdk.state.clients.hyperliquid.l2Orderbook.history).toHaveBeenCalledWith('BTC', {
        start: START_MS,
        end: END_MS,
      });
    });
  });
});
