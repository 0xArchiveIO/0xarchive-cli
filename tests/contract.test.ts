import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OxArchiveError } from '@0xarchive/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureIo, lastError, runCli, stdoutJson, stdoutText, stderrText } from './helpers.js';
import { exitCodeForApiError } from '../src/lib/errors.js';

// The API contract (version 2026-10-01) on the command tree: error codes on
// every failure, `oxa capabilities`, `has_more` on paged output, the filters
// the API now honours, and the conforming command forms next to the old ones.
// The SDK surface the commands call is stubbed, so this file checks exactly
// which SDK method each command calls, with which arguments, and what it
// prints, on any installed SDK release.
const sdk = vi.hoisted(() => {
  const page = () => ({ data: [], nextCursor: undefined, hasMore: false });
  const venue = () => ({
    trades: {
      list: vi.fn(async () => page()),
      recent: vi.fn(async () => []),
      history: vi.fn(async () => page()),
    },
    orderbook: { get: vi.fn(async () => ({ bids: [], asks: [] })), history: vi.fn(async () => page()) },
    candles: { history: vi.fn(async () => page()) },
    instruments: { list: vi.fn(async () => []) },
    orders: { history: vi.fn(async () => page()), flow: vi.fn(async () => page()), tpsl: vi.fn(async () => page()) },
    l2Orderbook: { history: vi.fn(async () => page()) },
    l4Orderbook: { get: vi.fn(async () => ({})), diffs: vi.fn(async () => page()), history: vi.fn(async () => page()) },
    cvd: { history: vi.fn(async () => page()) },
    freshness: vi.fn(async () => ({})),
    summary: vi.fn(async () => ({})),
    priceHistory: vi.fn(async () => page()),
    l3Orderbook: { get: vi.fn(async () => ({})), history: vi.fn(async () => page()) },
    accounts: { byL1: vi.fn(async () => page()) },
  });
  const fresh = () => ({
    hyperliquid: { ...venue(), hip3: venue() },
    lighter: venue(),
    rhLighter: venue(),
    spot: {
      ...venue(),
      pairs: { list: vi.fn(async () => []), get: vi.fn(async () => ({})) },
      twap: { bySymbol: vi.fn(async () => page()), byUser: vi.fn(async () => page()) },
    },
    symbols: { list: vi.fn(async () => []) },
    capabilities: vi.fn(async () => CAPABILITIES) as ReturnType<typeof vi.fn> | undefined,
  });
  const CAPABILITIES = [
    {
      venue: 'hyperliquid',
      datatype: 'trades',
      restRoutes: ['/v1/hyperliquid/trades/{symbol}'],
      wsChannels: ['trades'],
      live: true,
      replay: true,
      availableFrom: '2023-04-15T03:31:00.000Z',
      cadence: 'event',
      pageLimit: 50000,
      intervals: [],
      notes: null,
    },
    {
      venue: 'hip3',
      datatype: 'l4_diffs',
      restRoutes: ['/v1/hyperliquid/hip3/orderbook/{symbol}/l4/diffs'],
      wsChannels: ['hip3_l4_diffs'],
      live: true,
      replay: true,
      availableFrom: '2026-03-11T01:03:00.000Z',
      cadence: 'event',
      pageLimit: 10000,
      intervals: [],
      notes: 'WebSocket replay is bulk (speed is ignored) and single-channel only.',
    },
    {
      venue: 'spot',
      datatype: 'trades',
      restRoutes: ['/v1/hyperliquid/spot/trades/{symbol}', '/v1/hyperliquid/spot/trades/{symbol}/recent'],
      wsChannels: ['spot_trades'],
      live: true,
      replay: false,
      availableFrom: '2025-03-22T10:50:22.000Z',
      cadence: 'event',
      pageLimit: 50000,
      intervals: [],
      notes: null,
    },
    {
      venue: 'spot',
      datatype: 'candles',
      restRoutes: ['/v1/hyperliquid/spot/candles/{symbol}'],
      wsChannels: [],
      live: false,
      replay: false,
      availableFrom: '2025-03-22T10:50:00.000Z',
      cadence: 'interval',
      pageLimit: 10000,
      intervals: ['1m', '1h'],
      notes: null,
    },
  ];
  const state = { clients: fresh(), apiKeys: [] as string[] };
  return {
    CAPABILITIES,
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
    get rhLighter() {
      return sdk.state.clients.rhLighter;
    }
    get spot() {
      return sdk.state.clients.spot;
    }
    get symbols() {
      return sdk.state.clients.symbols;
    }
    get capabilities() {
      return sdk.state.clients.capabilities;
    }
  }
  return { ...actual, OxArchive };
});

const START = '2026-09-01T00:00:00Z';
const END = '2026-09-02T00:00:00Z';
const START_MS = Date.parse(START);
const END_MS = Date.parse(END);

/** An SDK error as the SDK release the CLI requires builds it from an API error body. */
function apiError(
  status: number,
  errorCode: string | undefined,
  extra: { requestId?: string; param?: string; validValues?: string[] } = {},
): OxArchiveError {
  const error = new OxArchiveError(`failed with ${errorCode ?? status}`, status, extra.requestId);
  return Object.assign(error, {
    ...(errorCode ? { errorCode } : {}),
    ...(extra.param ? { param: extra.param } : {}),
    ...(extra.validValues ? { validValues: extra.validValues } : {}),
  });
}

describe('API contract 2026-10-01 in the CLI', () => {
  beforeEach(() => {
    sdk.reset();
    captureIo();
    vi.stubEnv('OXA_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('errors print the API error_code and request id', () => {
    it.each(['json', 'pretty'])('in %s output', async (format) => {
      sdk.state.clients.hyperliquid.candles.history.mockRejectedValue(
        apiError(400, 'invalid_interval', { requestId: 'req-7', param: 'interval', validValues: ['1m', '1h'] }),
      );
      const code = await runCli(
        'candles', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC',
        '--start', START, '--end', END, '--format', format,
      );
      expect(code).toBe(2);
      expect(lastError()).toEqual({
        error: 'failed with invalid_interval',
        code: 2,
        type: 'validation',
        error_code: 'invalid_interval',
        request_id: 'req-7',
        status: 400,
        param: 'interval',
        valid_values: ['1m', '1h'],
      });
      expect(stdoutText()).toBe('');
    });

    it.each([
      ['invalid_symbol', 400, 2, 'validation'],
      ['invalid_parameter', 400, 2, 'validation'],
      ['invalid_cursor', 400, 2, 'validation'],
      ['invalid_time_range', 400, 2, 'validation'],
      ['range_before_coverage', 400, 2, 'validation'],
      ['unsupported_for_venue', 404, 2, 'validation'],
      ['route_not_found', 404, 2, 'validation'],
      ['not_found', 404, 2, 'validation'],
      ['unauthorized', 401, 3, 'auth'],
      ['forbidden', 403, 3, 'auth'],
      ['historical_depth_exceeded', 403, 3, 'auth'],
      ['historical_range_exceeded', 403, 3, 'auth'],
      ['insufficient_credits', 402, 3, 'auth'],
      ['rate_limited', 429, 4, 'network'],
      ['conflict', 409, 4, 'network'],
      ['upstream_unavailable', 503, 4, 'network'],
      ['internal_error', 500, 4, 'network'],
      ['a_future_code', 400, 4, 'network'],
    ])('%s (HTTP %i) exits %i (%s)', async (errorCode, status, exit, type) => {
      sdk.state.clients.hyperliquid.trades.list.mockRejectedValue(apiError(status, errorCode, { requestId: 'r' }));
      const code = await runCli(
        'trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END,
      );
      expect(code).toBe(exit);
      expect(lastError()).toMatchObject({ code: exit, type, error_code: errorCode, request_id: 'r', status });
    });

    it('falls back to the HTTP status when the API sends no code', () => {
      expect(exitCodeForApiError(undefined, 401)).toBe(3);
      expect(exitCodeForApiError(undefined, 403)).toBe(3);
      expect(exitCodeForApiError(undefined, 400)).toBe(4);
      expect(exitCodeForApiError(undefined, 500)).toBe(4);
      expect(exitCodeForApiError(undefined)).toBe(4);
    });

    it('prints no status or code for a failure the API did not answer', async () => {
      sdk.state.clients.hyperliquid.trades.list.mockRejectedValue(new OxArchiveError('fetch failed', 500));
      const code = await runCli(
        'trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END,
      );
      expect(code).toBe(4);
      expect(lastError()).toEqual({ error: 'fetch failed', code: 4, type: 'network' });
    });

    it('scrubs the API key from the message and keeps the code', async () => {
      sdk.state.clients.hyperliquid.trades.list.mockRejectedValue(
        Object.assign(new OxArchiveError('bad key test-key-123456', 401, 'r1'), { errorCode: 'unauthorized' }),
      );
      const code = await runCli(
        'trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC',
        '--start', START, '--end', END, '--api-key', 'test-key-123456',
      );
      expect(code).toBe(3);
      expect(stderrText()).not.toContain('test-key-123456');
      expect(lastError()).toMatchObject({ error_code: 'unauthorized', request_id: 'r1' });
    });
  });

  describe('oxa capabilities', () => {
    it('prints every row as JSON, without needing an API key', async () => {
      vi.stubEnv('OXA_API_KEY', '');
      expect(await runCli('capabilities')).toBe(0);
      expect(stdoutJson()).toEqual(sdk.CAPABILITIES);
      expect(sdk.state.apiKeys).toEqual(['anonymous']);
    });

    it('uses the API key when one is set', async () => {
      expect(await runCli('capabilities', '--api-key', 'k-1')).toBe(0);
      expect(sdk.state.apiKeys).toEqual(['k-1']);
    });

    it('filters by venue and datatype', async () => {
      expect(await runCli('capabilities', '--exchange', 'spot')).toBe(0);
      expect(stdoutJson().map((r: any) => r.datatype)).toEqual(['trades', 'candles']);

      vi.mocked(process.stdout.write).mockClear();
      expect(await runCli('capabilities', '--datatype', 'trades')).toBe(0);
      expect(stdoutJson().map((r: any) => r.venue)).toEqual(['hyperliquid', 'spot']);

      vi.mocked(process.stdout.write).mockClear();
      expect(await runCli('capabilities', '--exchange', 'spot', '--datatype', 'trades')).toBe(0);
      expect(stdoutJson()).toEqual([sdk.CAPABILITIES[2]]);
    });

    it('prints a table in pretty format', async () => {
      expect(await runCli('capabilities', '--format', 'pretty')).toBe(0);
      const out = stdoutText();
      expect(out).toContain('Capabilities, 4 rows');
      expect(out).toMatch(/Venue\s+Datatype\s+Live\s+Replay\s+Available From\s+Cadence\s+Page Limit\s+WebSocket Channels/);
      expect(out).toMatch(/hip3\s+l4_diffs\s+yes\s+yes\s+2026-03-11 01:03 UTC\s+event\s+10000\s+hip3_l4_diffs/);
      expect(out).toMatch(/spot\s+candles\s+no\s+no\s+2025-03-22 10:50 UTC\s+interval\s+10000\s+-/);
    });

    it('prints one row in full: routes, intervals, and notes', async () => {
      expect(await runCli('capabilities', '--exchange', 'hip3', '--datatype', 'l4_diffs', '--format', 'pretty')).toBe(0);
      const out = stdoutText();
      expect(out).toContain('Hyperliquid HIP-3 l4_diffs');
      expect(out).toContain('REST routes: /v1/hyperliquid/hip3/orderbook/{symbol}/l4/diffs');
      expect(out).toContain('Notes: WebSocket replay is bulk');
    });

    it('names the datatypes a venue serves when the datatype is unknown', async () => {
      expect(await runCli('capabilities', '--exchange', 'spot', '--datatype', 'funding')).toBe(2);
      expect(lastError().error).toBe('No datatype "funding". Hyperliquid Spot serves: candles or trades.');
    });

    it('refuses an unknown venue before any request', async () => {
      expect(await runCli('capabilities', '--exchange', 'hl')).toBe(2);
      expect(lastError().error).toBe('Invalid --exchange "hl". Must be hyperliquid, hip3, hip4, spot, lighter, or rh-lighter.');
      expect(sdk.state.clients.capabilities).not.toHaveBeenCalled();
    });

    it('prints the error_code when the request fails', async () => {
      sdk.state.clients.capabilities!.mockRejectedValue(apiError(503, 'upstream_unavailable', { requestId: 'c1' }));
      expect(await runCli('capabilities')).toBe(4);
      expect(lastError()).toMatchObject({ error_code: 'upstream_unavailable', request_id: 'c1', status: 503 });
    });

    it('asks for the SDK floor on an SDK without capabilities()', async () => {
      sdk.state.clients.capabilities = undefined;
      expect(await runCli('capabilities')).toBe(5);
      expect(lastError().error).toMatch(/^Support for capabilities requires @0xarchive\/sdk 1\.12\.0 or newer/);
    });
  });

  describe('has_more on paged output', () => {
    it('reports has_more and the next cursor from the SDK page', async () => {
      sdk.state.clients.hyperliquid.trades.list.mockResolvedValue({ data: [{ tid: 1 }], nextCursor: 'c2', hasMore: true });
      expect(
        await runCli('trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END),
      ).toBe(0);
      expect(stdoutJson()).toEqual({ data: [{ tid: 1 }], nextCursor: 'c2', has_more: true });
    });

    it('reports has_more false on the last page, which may be empty', async () => {
      sdk.state.clients.hyperliquid.hip3.orderbook.history.mockResolvedValue({ data: [], nextCursor: undefined, hasMore: false });
      expect(
        await runCli('orderbook', 'history', '--exchange', 'hip3', '--symbol', 'km:US500', '--start', START, '--end', END),
      ).toBe(0);
      expect(stdoutJson()).toEqual({ data: [], nextCursor: null, has_more: false });
    });

    it('trusts has_more over the cursor when the page says it', async () => {
      // Order flow does not send has_more yet: the SDK then reports more
      // exactly when a cursor came back.
      sdk.state.clients.hyperliquid.orders.flow.mockResolvedValue({ data: [{ t: 1 }], nextCursor: undefined, hasMore: false });
      expect(
        await runCli('orders', 'flow', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END),
      ).toBe(0);
      expect(stdoutJson()).toMatchObject({ nextCursor: null, has_more: false });
    });

    it('falls back to the cursor on an SDK page without hasMore', async () => {
      sdk.state.clients.lighter.candles.history.mockResolvedValue({ data: [], nextCursor: 'n' });
      expect(
        await runCli('candles', 'history', '--exchange', 'lighter', '--symbol', 'BTC', '--start', START, '--end', END),
      ).toBe(0);
      expect(stdoutJson()).toEqual({ data: [], nextCursor: 'n', has_more: true });
    });

    it('prints the cursor to pass back in pretty format', async () => {
      sdk.state.clients.hyperliquid.trades.list.mockResolvedValue({
        data: [{ timestamp: '2026-09-01T00:00:00Z', side: 'B', price: '1', size: '2' }],
        nextCursor: 'next-page-cursor',
        hasMore: true,
      });
      expect(
        await runCli(
          'trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC',
          '--start', START, '--end', END, '--format', 'pretty',
        ),
      ).toBe(0);
      expect(stdoutText()).toContain('More data available: rerun with --cursor next-page-cursor');
    });

    it('reports has_more in the --out summary', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'oxa-contract-'));
      const out = join(dir, 'page.json');
      sdk.state.clients.hyperliquid.l2Orderbook.history.mockResolvedValue({ data: [], nextCursor: 'x', hasMore: true });
      expect(
        await runCli(
          'l2', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC',
          '--start', START, '--end', END, '--out', out,
        ),
      ).toBe(0);
      expect(stdoutJson()).toMatchObject({ has_more: true, nextCursor: 'x' });
      expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ data: [], nextCursor: 'x', has_more: true });
      rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('filters the API honours', () => {
    it.each(['hyperliquid', 'hip3', 'lighter', 'rh-lighter'])('sends --side on %s trade history', async (exchange) => {
      expect(
        await runCli(
          'trades', 'history', '--exchange', exchange, '--symbol', 'BTC', '--start', START, '--end', END, '--side', 'sell',
        ),
      ).toBe(0);
      const client = exchange === 'hyperliquid'
        ? sdk.state.clients.hyperliquid
        : exchange === 'hip3'
          ? sdk.state.clients.hyperliquid.hip3
          : exchange === 'lighter'
            ? sdk.state.clients.lighter
            : sdk.state.clients.rhLighter;
      expect(client.trades.list).toHaveBeenCalledWith('BTC', { start: START_MS, end: END_MS, side: 'sell' });
    });

    it('sends --side on Spot trade history, from either form', async () => {
      expect(
        await runCli(
          'trades', 'history', '--exchange', 'spot', '--symbol', 'HYPE-USDC', '--start', START, '--end', END, '--side', 'buy',
        ),
      ).toBe(0);
      expect(await runCli('spot', 'trades', 'HYPE-USDC', '--start', START, '--end', END, '--side', 'buy')).toBe(0);
      const calls = sdk.state.clients.spot.trades.list.mock.calls;
      expect(calls).toHaveLength(2);
      for (const [symbol, params] of calls) {
        expect(symbol).toBe('HYPE-USDC');
        expect(params).toMatchObject({ start: START_MS, end: END_MS, side: 'buy' });
      }
    });

    it('sends --side on recent trades', async () => {
      expect(await runCli('trades', 'history', '--exchange', 'hip3', '--symbol', 'km:US500', '--side', 'buy', '--limit', '5')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.trades.recent).toHaveBeenCalledWith('km:US500', { limit: 5, side: 'buy' });

      expect(await runCli('trades', 'history', '--exchange', 'spot', '--symbol', 'HYPE-USDC')).toBe(0);
      expect(sdk.state.clients.spot.trades.recent).toHaveBeenCalledWith('HYPE-USDC', 100);
    });

    it('asks for the SDK floor for --side on recent trades on an older SDK', async () => {
      delete (sdk.state.clients.lighter.trades as Record<string, unknown>).history;
      expect(await runCli('trades', 'history', '--exchange', 'lighter', '--symbol', 'BTC', '--side', 'buy')).toBe(5);
      expect(lastError().error).toMatch(/--side on recent trades requires @0xarchive\/sdk 1\.12\.0/);
    });

    it('refuses a --side other than buy or sell before any request', async () => {
      expect(
        await runCli('trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END, '--side', 'B'),
      ).toBe(2);
      expect(lastError().error).toBe('Invalid --side "B". Must be buy or sell.');
      expect(sdk.state.clients.hyperliquid.trades.list).not.toHaveBeenCalled();
    });

    it.each(['hyperliquid', 'hip3'])('sends --triggered on %s order history', async (exchange) => {
      expect(
        await runCli(
          'orders', 'history', '--exchange', exchange, '--symbol', 'BTC', '--start', START, '--end', END, '--triggered', 'true',
        ),
      ).toBe(0);
      const orders = exchange === 'hip3' ? sdk.state.clients.hyperliquid.hip3.orders : sdk.state.clients.hyperliquid.orders;
      expect(orders.history).toHaveBeenCalledWith('BTC', { start: START_MS, end: END_MS, triggered: true });

      expect(
        await runCli(
          'orders', 'history', '--exchange', exchange, '--symbol', 'BTC', '--start', START, '--end', END, '--triggered', 'false',
        ),
      ).toBe(0);
      expect(orders.history).toHaveBeenLastCalledWith('BTC', { start: START_MS, end: END_MS, triggered: false });
    });

    it('refuses a --triggered that is not true or false', async () => {
      expect(
        await runCli('orders', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END, '--triggered', 'yes'),
      ).toBe(2);
      expect(lastError().error).toBe('--triggered must be true or false (got yes)');
    });

    it('refuses the order filters on Spot order history', async () => {
      expect(
        await runCli('orders', 'history', '--exchange', 'spot', '--symbol', 'HYPE-USDC', '--start', START, '--end', END, '--triggered', 'true'),
      ).toBe(2);
      expect(lastError().error).toBe(
        '--triggered is not available on Spot order history, which takes the time range and cursor only.',
      );
      expect(sdk.state.clients.spot.orders.history).not.toHaveBeenCalled();
    });

    it.each(['hyperliquid', 'hip3'])('sends --depth on %s full-depth L2 history', async (exchange) => {
      expect(
        await runCli('l2', 'history', '--exchange', exchange, '--symbol', 'BTC', '--start', START, '--end', END, '--depth', '5'),
      ).toBe(0);
      const l2 = exchange === 'hip3' ? sdk.state.clients.hyperliquid.hip3.l2Orderbook : sdk.state.clients.hyperliquid.l2Orderbook;
      expect(l2.history).toHaveBeenCalledWith('BTC', { start: START_MS, end: END_MS, depth: 5 });
    });

    it.each([
      ['hip3', 'km:US500'],
      ['spot', 'HYPE-USDC'],
    ])('sends --depth on %s order book history', async (exchange, symbol) => {
      expect(
        await runCli('orderbook', 'history', '--exchange', exchange, '--symbol', symbol, '--start', START, '--end', END, '--depth', '3'),
      ).toBe(0);
      const orderbook = exchange === 'spot' ? sdk.state.clients.spot.orderbook : sdk.state.clients.hyperliquid.hip3.orderbook;
      expect(orderbook.history).toHaveBeenCalledWith(symbol, expect.objectContaining({ start: START_MS, end: END_MS, depth: 3 }));
    });
  });

  describe('one grammar: oxa <datatype> <verb> --exchange <venue>', () => {
    it('keeps `oxa trades fetch` as the same command as `oxa trades history`', async () => {
      const args = ['--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END];
      expect(await runCli('trades', 'fetch', ...args)).toBe(0);
      expect(await runCli('trades', 'history', ...args)).toBe(0);
      const calls = sdk.state.clients.hyperliquid.trades.list.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual(calls[1]);
    });

    it.each([
      [['candles'], ['candles', 'history'], ['--exchange', 'hip3', '--symbol', 'km:US500', '--start', START, '--end', END]],
      [['prices'], ['prices', 'history'], ['--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END]],
      [['summary'], ['summary', 'get'], ['--exchange', 'hyperliquid', '--symbol', 'BTC']],
      [['freshness'], ['freshness', 'get'], ['--exchange', 'hip3', '--symbol', 'km:US500']],
      [['instruments'], ['instruments', 'list'], ['--exchange', 'lighter']],
      [['symbols'], ['symbols', 'list'], []],
    ])('%j and %j run the same command', async (oldForm, newForm, args) => {
      expect(await runCli(...oldForm, ...args)).toBe(0);
      const first = stdoutText();
      vi.mocked(process.stdout.write).mockClear();
      expect(await runCli(...newForm, ...args)).toBe(0);
      expect(stdoutText()).toBe(first);
    });

    it('routes candles, prices, summary, freshness, and instruments to the venue client', async () => {
      await runCli('candles', 'history', '--exchange', 'hip3', '--symbol', 'km:US500', '--start', START, '--end', END);
      expect(sdk.state.clients.hyperliquid.hip3.candles.history).toHaveBeenCalledTimes(1);
      await runCli('prices', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END);
      expect(sdk.state.clients.hyperliquid.priceHistory).toHaveBeenCalledTimes(1);
      await runCli('summary', 'get', '--exchange', 'hyperliquid', '--symbol', 'BTC');
      expect(sdk.state.clients.hyperliquid.summary).toHaveBeenCalledWith('BTC');
      await runCli('freshness', 'get', '--exchange', 'hip3', '--symbol', 'km:US500');
      expect(sdk.state.clients.hyperliquid.hip3.freshness).toHaveBeenCalledWith('km:US500');
      await runCli('instruments', 'list', '--exchange', 'lighter');
      expect(sdk.state.clients.lighter.instruments.list).toHaveBeenCalledTimes(1);
    });

    it('takes the CVD symbol as --symbol or as the first argument', async () => {
      expect(await runCli('cvd', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--interval', '1h')).toBe(0);
      expect(await runCli('cvd', 'BTC', '--exchange', 'hyperliquid', '--interval', '1h')).toBe(0);
      const calls = sdk.state.clients.hyperliquid.cvd.history.mock.calls;
      expect(calls).toEqual([
        ['BTC', { interval: '1h' }],
        ['BTC', { interval: '1h' }],
      ]);
    });

    it('asks for a CVD symbol, and refuses two different ones', async () => {
      expect(await runCli('cvd', 'history', '--exchange', 'hyperliquid')).toBe(2);
      expect(lastError().error).toBe('A symbol is required: oxa cvd history --exchange <exchange> --symbol <symbol>.');
      expect(await runCli('cvd', 'history', 'BTC', '--exchange', 'hyperliquid', '--symbol', 'ETH')).toBe(2);
      expect(lastError().error).toBe('Two symbols given ("BTC" and --symbol "ETH"). Pass one.');
    });

    it('serves Spot shared datatypes with --exchange spot', async () => {
      const range = ['--start', START, '--end', END];
      expect(await runCli('orderbook', 'get', '--exchange', 'spot', '--symbol', 'HYPE-USDC', '--depth', '5')).toBe(0);
      expect(sdk.state.clients.spot.orderbook.get).toHaveBeenCalledWith('HYPE-USDC', { depth: 5, timestamp: undefined });
      expect(await runCli('l4', 'get', '--exchange', 'spot', '--symbol', 'HYPE-USDC')).toBe(0);
      expect(sdk.state.clients.spot.l4Orderbook.get).toHaveBeenCalledWith('HYPE-USDC', {});
      expect(await runCli('l4', 'diffs', '--exchange', 'spot', '--symbol', 'HYPE-USDC', ...range)).toBe(0);
      expect(sdk.state.clients.spot.l4Orderbook.diffs).toHaveBeenCalledWith('HYPE-USDC', { start: START_MS, end: END_MS });
      expect(await runCli('l4', 'history', '--exchange', 'spot', '--symbol', 'HYPE-USDC', ...range)).toBe(0);
      expect(sdk.state.clients.spot.l4Orderbook.history).toHaveBeenCalledWith('HYPE-USDC', { start: START_MS, end: END_MS });
      expect(await runCli('orders', 'history', '--exchange', 'spot', '--symbol', 'HYPE-USDC', ...range)).toBe(0);
      expect(sdk.state.clients.spot.orders.history).toHaveBeenCalledWith('HYPE-USDC', { start: START_MS, end: END_MS });
      expect(await runCli('freshness', 'get', '--exchange', 'spot', '--symbol', 'HYPE-USDC')).toBe(0);
      expect(sdk.state.clients.spot.freshness).toHaveBeenCalledWith('HYPE-USDC');
      expect(await runCli('instruments', 'list', '--exchange', 'spot')).toBe(0);
      expect(sdk.state.clients.spot.pairs.list).toHaveBeenCalledTimes(1);
    });

    it('refuses --exchange spot where Spot has no route, and names the Spot commands', async () => {
      expect(await runCli('funding', 'history', '--exchange', 'spot', '--symbol', 'HYPE-USDC', '--start', START, '--end', END)).toBe(2);
      expect(lastError().error).toMatch(/^Hyperliquid Spot \(--exchange spot\) is not served by this command\./);
    });

    it('lists Spot pairs and gets one under the venue', async () => {
      expect(await runCli('spot', 'pairs')).toBe(0);
      expect(await runCli('spot', 'pairs', 'list')).toBe(0);
      expect(sdk.state.clients.spot.pairs.list).toHaveBeenCalledTimes(2);
      expect(await runCli('spot', 'pairs', 'get', 'HYPE-USDC')).toBe(0);
      expect(await runCli('spot', 'pair', 'HYPE-USDC')).toBe(0);
      expect(sdk.state.clients.spot.pairs.get.mock.calls).toEqual([['HYPE-USDC'], ['HYPE-USDC']]);
    });

    it('keeps `oxa spot twap <symbol>` as `oxa spot twap history <symbol>`', async () => {
      const range = ['--start', START, '--end', END];
      expect(await runCli('spot', 'twap', 'HYPE-USDC', ...range)).toBe(0);
      expect(await runCli('spot', 'twap', 'history', 'HYPE-USDC', ...range)).toBe(0);
      expect(sdk.state.clients.spot.twap.bySymbol.mock.calls).toEqual([
        ['HYPE-USDC', { start: START_MS, end: END_MS }],
        ['HYPE-USDC', { start: START_MS, end: END_MS }],
      ]);
    });

    it('puts the Lighter-only L3 book and account lookup under `oxa lighter`, keeping the old forms', async () => {
      expect(await runCli('lighter', 'l3', 'get', '--symbol', 'BTC', '--depth', '10')).toBe(0);
      expect(await runCli('l3', 'get', '--symbol', 'BTC', '--depth', '10')).toBe(0);
      expect(sdk.state.clients.lighter.l3Orderbook.get.mock.calls).toEqual([
        ['BTC', { depth: 10 }],
        ['BTC', { depth: 10 }],
      ]);

      const address = '0x1111111111111111111111111111111111111111';
      expect(await runCli('lighter', 'accounts', 'by-l1', '--l1-address', address)).toBe(0);
      expect(await runCli('accounts', 'by-l1', '--l1-address', address)).toBe(0);
      expect(sdk.state.clients.lighter.accounts.byL1).toHaveBeenCalledTimes(2);
    });
  });
});
