import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OxArchiveError } from '@0xarchive/sdk';
import { transformKeys } from '../src/lib/http.js';
import { captureIo, lastError, runCli, stderrText, stdoutJson, stdoutText } from './helpers.js';

// The Build-and-above datasets: trade intent, USDC flows, breadth above the
// n-day moving average, and positioning. Each test parses a real argument
// vector with the command tree against a stubbed SDK surface, and the SDK
// results are built from responses recorded from the API (tests/fixtures/derived),
// camelCased as the SDK returns them.

const sdk = vi.hoisted(() => {
  const venue = () => ({
    tradeIntent: { history: vi.fn() } as Record<string, any> | undefined,
    breadthMa: { current: vi.fn(), history: vi.fn() } as Record<string, any> | undefined,
    positioning: { current: vi.fn() } as Record<string, any> | undefined,
    breadth: { current: vi.fn(), history: vi.fn() },
  });
  const fresh = () => ({
    hyperliquid: {
      ...venue(),
      usdcFlows: { history: vi.fn(), volume: vi.fn() } as Record<string, any> | undefined,
      hip3: venue(),
    },
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
  }
  return { ...actual, OxArchive };
});

interface Recorded {
  request: { path: string; query: Record<string, unknown>; plan: string };
  status: number;
  body: Record<string, any>;
}

function recorded(name: string): Recorded {
  return JSON.parse(readFileSync(new URL(`./fixtures/derived/${name}.json`, import.meta.url), 'utf8'));
}

/** A recorded 2xx response as the SDK returns a page: camelCased rows, cursor, has-more and meta. */
function sdkPage(name: string): { data: any; nextCursor?: string; hasMore: boolean; meta: Record<string, any> } {
  const { body } = recorded(name);
  const meta = transformKeys(body.meta) as Record<string, any>;
  return {
    data: transformKeys(body.data),
    nextCursor: meta.nextCursor,
    hasMore: meta.hasMore ?? meta.nextCursor !== undefined,
    meta,
  };
}

/** A recorded single-record response as the SDK returns it: the camelCased record. */
function sdkRecord(name: string): any {
  return transformKeys(recorded(name).body.data);
}

/** A recorded error response as the SDK raises it. */
function sdkError(name: string, asPlanRequiredError: boolean): OxArchiveError {
  const { status, body } = recorded(name);
  const camel = transformKeys(body) as Record<string, any>;
  // SDK releases from 1.12 keep the error body; 1.14 raises PlanRequiredError
  // with the plan fields as properties as well.
  const error = new OxArchiveError(camel.error, status, camel.requestId, camel.errorCode, { body: camel });
  return asPlanRequiredError
    ? Object.assign(error, { datatype: camel.datatype, requiredPlans: camel.requiredPlans, upgradeUrl: camel.upgradeUrl })
    : error;
}

const START = '2026-11-02T00:00:00Z';
const END = '2026-11-02T05:00:00Z';
const START_MS = Date.parse(START);
const END_MS = Date.parse(END);

describe('Build-and-above datasets', () => {
  let dir: string;

  beforeEach(() => {
    sdk.reset();
    captureIo();
    vi.stubEnv('OXA_API_KEY', 'test-key');
    dir = mkdtempSync(join(tmpdir(), 'oxa-derived-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('oxa trade-intent history', () => {
    it('sends the symbol and window to the core resource and keeps the cursor and the advisory meta', async () => {
      const page = sdkPage('trade_intent_btc_1h_page1');
      sdk.state.clients.hyperliquid.tradeIntent!.history.mockResolvedValue(page);
      const code = await runCli(
        'trade-intent', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC',
        '--start', START, '--end', END, '--interval', '1h', '--limit', '3',
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.tradeIntent!.history).toHaveBeenCalledWith('BTC', {
        start: START_MS,
        end: END_MS,
        interval: '1h',
        limit: 3,
      });
      const out = stdoutJson();
      expect(out.data).toEqual(page.data);
      expect(out.data[0]).toMatchObject({ openLong: 27144995.59, mmUsd: 66752421.84, winnersCount: 4, method: 'who/3' });
      expect(out.nextCursor).toBe('1793588400000');
      expect(out.has_more).toBe(true);
      expect(out.meta).toEqual({ builtThrough: '2026-11-04T19:00:00.000Z' });
    });

    it('takes the symbol as the first argument and routes HIP-3 symbols unchanged', async () => {
      sdk.state.clients.hyperliquid.hip3.tradeIntent!.history.mockResolvedValue(sdkPage('trade_intent_hip3_1h'));
      expect(await runCli('trade-intent', 'history', 'xyz:XYZ100', '--exchange', 'hip3', '--cursor', '1793581200000')).toBe(0);
      expect(sdk.state.clients.hyperliquid.hip3.tradeIntent!.history).toHaveBeenCalledWith('xyz:XYZ100', {
        cursor: '1793581200000',
      });
      expect(sdk.state.clients.hyperliquid.tradeIntent!.history).not.toHaveBeenCalled();
      expect(stdoutJson()).toMatchObject({ nextCursor: null, has_more: false });
    });

    it('keeps second buckets\' null close and cohort figures and reports preliminary rows', async () => {
      sdk.state.clients.hyperliquid.tradeIntent!.history.mockResolvedValue(sdkPage('trade_intent_btc_1s'));
      expect(await runCli('trade-intent', 'history', 'BTC', '--exchange', 'hyperliquid', '--interval', '1s')).toBe(0);
      const out = stdoutJson();
      expect(out.data[0]).toMatchObject({ close: null, priceSource: null, winnersNet: null, winnersCount: null, preliminary: true });
      expect(out.meta).toEqual({ builtThrough: '2026-11-04T20:01:00.000Z', preliminaryRowCount: 3 });
    });

    it('prints buckets, finality and the cursor in pretty output', async () => {
      sdk.state.clients.hyperliquid.tradeIntent!.history.mockResolvedValue(sdkPage('trade_intent_btc_1m_live'));
      expect(await runCli('trade-intent', 'history', 'BTC', '--exchange', 'hyperliquid', '--interval', '1m', '--format', 'pretty')).toBe(0);
      const text = stdoutText();
      expect(text).toContain('BTC Trade Intent (Hyperliquid), 3 buckets');
      expect(text).toContain('Preliminary buckets: 3');
      expect(text).toContain('2026-11-04T19:55:00.000Z');
      expect(text).toContain('592331.45');
      expect(text).toContain('rerun with --cursor 1793822280000');
    });

    it('writes the page to --out and prints a summary', async () => {
      const out = join(dir, 'intent.json');
      sdk.state.clients.hyperliquid.tradeIntent!.history.mockResolvedValue(sdkPage('trade_intent_btc_1h_page1'));
      expect(await runCli('trade-intent', 'history', 'BTC', '--exchange', 'hyperliquid', '--out', out)).toBe(0);
      expect(JSON.parse(readFileSync(out, 'utf8')).data).toHaveLength(3);
      expect(stdoutJson()).toEqual({
        written_to: out,
        records: 3,
        exchange: 'hyperliquid',
        symbol: 'BTC',
        has_more: true,
        nextCursor: '1793588400000',
      });
    });

    it.each([
      [['BTC', '--exchange', 'lighter'], 'Lighter has no trade intent endpoint. Use --exchange hyperliquid or hip3.'],
      [['BTC', '--exchange', 'hip4'], 'Hyperliquid HIP-4 has no trade intent endpoint. Use --exchange hyperliquid or hip3.'],
      [['--exchange', 'hyperliquid'], 'A symbol is required: oxa trade-intent history --exchange <exchange> --symbol <symbol>.'],
      [['BTC', '--exchange', 'hyperliquid', '--interval', '2m'], 'Invalid --interval "2m". Must be 1s, 5s, 15s, 1m, 5m, 15m, 1h, 4h, or 1d.'],
      [['BTC', '--exchange', 'hyperliquid', '--limit', '2001'], '--limit must be a whole number from 1 to 2000 (got 2001)'],
      [['BTC', '--exchange', 'hyperliquid', '--start', END, '--end', START], '--start must not be after --end'],
    ])('refuses %j before any request', async (args, message) => {
      expect(await runCli('trade-intent', 'history', ...args)).toBe(2);
      expect(lastError()).toEqual({ error: message, code: 2, type: 'validation' });
      expect(sdk.state.clients.hyperliquid.tradeIntent!.history).not.toHaveBeenCalled();
    });

    it('exits 2 with the API\'s code, parameter and valid values on a refused interval', async () => {
      sdk.state.clients.hyperliquid.tradeIntent!.history.mockRejectedValue(
        (() => {
          const { status, body } = recorded('trade_intent_invalid_interval');
          return Object.assign(new OxArchiveError(body.error, status, body.request_id), {
            errorCode: body.error_code,
            param: body.param,
            validValues: body.valid_values,
          });
        })(),
      );
      expect(await runCli('trade-intent', 'history', 'BTC', '--exchange', 'hyperliquid')).toBe(2);
      expect(lastError()).toMatchObject({
        code: 2,
        error_code: 'invalid_interval',
        param: 'interval',
        valid_values: ['1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1d'],
      });
    });
  });

  describe('oxa usdc-flows', () => {
    it('pages events with the window and filters (Hyperliquid by default)', async () => {
      const page = sdkPage('usdc_flows_events_filtered');
      sdk.state.clients.hyperliquid.usdcFlows!.history.mockResolvedValue(page);
      const code = await runCli(
        'usdc-flows', 'history', '--start', START, '--end', END,
        '--kind', 'withdraw', '--min-usd', '1000000', '--limit', '5', '--cursor', 'abc',
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.usdcFlows!.history).toHaveBeenCalledWith({
        start: START_MS,
        end: END_MS,
        kind: 'withdraw',
        minUsd: 1000000,
        limit: 5,
        cursor: 'abc',
      });
      const out = stdoutJson();
      expect(out.data[0]).toMatchObject({
        id: '1205903006:0',
        kind: 'withdraw',
        amountUsd: 1695639.0,
        feeUsd: 1.0,
        user: '0x70e8b3627fe9de9adbc13cdffc96f11b91bd6424',
      });
      expect(out).toMatchObject({ nextCursor: page.nextCursor, has_more: true });
    });

    it('reports an empty page that still has more to follow', async () => {
      sdk.state.clients.hyperliquid.usdcFlows!.history.mockResolvedValue(sdkPage('usdc_flows_events_sparse_page1'));
      expect(await runCli('usdc-flows', 'history', '--exchange', 'hyperliquid', '--min-usd', '100000000000')).toBe(0);
      expect(stdoutJson()).toEqual({
        data: [],
        nextCursor: '1785542399999_18446744073709551615_4294967295',
        has_more: true,
      });
    });

    it('says so in pretty output when an empty page has more to follow', async () => {
      sdk.state.clients.hyperliquid.usdcFlows!.history.mockResolvedValue(sdkPage('usdc_flows_events_sparse_page1'));
      expect(await runCli('usdc-flows', 'history', '--min-usd', '100000000000', '--format', 'pretty')).toBe(0);
      const text = stdoutText();
      expect(text).toContain('No events on this page; more of the window follows');
      expect(text).toContain('rerun with --cursor 1785542399999_18446744073709551615_4294967295');
    });

    it('prints events in pretty output', async () => {
      sdk.state.clients.hyperliquid.usdcFlows!.history.mockResolvedValue(sdkPage('usdc_flows_events_page1'));
      expect(await runCli('usdc-flows', 'history', '--format', 'pretty')).toBe(0);
      const text = stdoutText();
      expect(text).toContain('Hyperliquid USDC Flows, 3 events');
      expect(text).toContain('1205759951:16');
      expect(text).toContain('evm_in');
    });

    it('pages volume buckets with the interval', async () => {
      const page = sdkPage('usdc_flows_volume_page1');
      sdk.state.clients.hyperliquid.usdcFlows!.volume.mockResolvedValue(page);
      expect(await runCli('usdc-flows', 'volume', '--exchange', 'hyperliquid', '--start', START, '--end', END, '--interval', '1h', '--limit', '3')).toBe(0);
      expect(sdk.state.clients.hyperliquid.usdcFlows!.volume).toHaveBeenCalledWith({
        start: START_MS,
        end: END_MS,
        interval: '1h',
        limit: 3,
      });
      const out = stdoutJson();
      expect(out.data[0]).toMatchObject({ depositUsd: 78574.57, depositCount: 30, netUsd: 6731488.01 });
      expect(out).toMatchObject({ nextCursor: '1793584800000', has_more: true });
    });

    it('prints volume buckets in pretty output', async () => {
      sdk.state.clients.hyperliquid.usdcFlows!.volume.mockResolvedValue(sdkPage('usdc_flows_volume_page1'));
      expect(await runCli('usdc-flows', 'volume', '--format', 'pretty')).toBe(0);
      const text = stdoutText();
      expect(text).toContain('Hyperliquid USDC Flow Volume, 3 buckets');
      expect(text).toContain('6731488.01');
    });

    it.each([
      [['history', '--exchange', 'hip3'], 'Hyperliquid HIP-3 has no USDC flows endpoint. Use --exchange hyperliquid.'],
      [['volume', '--exchange', 'lighter'], 'Lighter has no USDC flows endpoint. Use --exchange hyperliquid.'],
      [['history', '--kind', 'bridge'], 'Invalid --kind "bridge". Must be deposit, withdraw, evm_in, or evm_out.'],
      [['history', '--min-usd', '-1'], '--min-usd must be a number from 0 to 1000000000000 (got -1)'],
      [['history', '--limit', '1001'], '--limit must be a whole number from 1 to 1000 (got 1001)'],
      [['volume', '--interval', '2h'], 'Invalid interval "2h". Must be one of: 1m, 5m, 15m, 30m, 1h, 4h, 1d'],
      [['volume', '--start', END, '--end', START], '--start must not be after --end'],
    ])('refuses %j before any request', async (args, message) => {
      expect(await runCli('usdc-flows', ...args)).toBe(2);
      expect(lastError()).toEqual({ error: message, code: 2, type: 'validation' });
      expect(sdk.state.clients.hyperliquid.usdcFlows!.history).not.toHaveBeenCalled();
      expect(sdk.state.clients.hyperliquid.usdcFlows!.volume).not.toHaveBeenCalled();
    });

    it.each([['--kind', 'deposit'], ['--min-usd', '5']])(
      'refuses %s on volume as an unknown option: totals count every flow',
      async (flag, value) => {
        expect(await runCli('usdc-flows', 'volume', flag, value)).toBe(1);
        expect(stderrText()).toContain(`unknown option '${flag}'`);
        expect(sdk.state.clients.hyperliquid.usdcFlows!.volume).not.toHaveBeenCalled();
      },
    );
  });

  describe('oxa breadth above-ma', () => {
    it('reads the current reading for --n from the core resource', async () => {
      const reading = sdkRecord('breadth_ma_hl_current_n200');
      sdk.state.clients.hyperliquid.breadthMa!.current.mockResolvedValue(reading);
      expect(await runCli('breadth', 'above-ma', 'current', '--exchange', 'hyperliquid', '--n', '200')).toBe(0);
      expect(sdk.state.clients.hyperliquid.breadthMa!.current).toHaveBeenCalledWith({ n: 200 });
      expect(sdk.state.clients.hyperliquid.breadth.current).not.toHaveBeenCalled();
      expect(stdoutJson()).toEqual(reading);
      expect(stdoutJson()).toMatchObject({ n: 200, valuePct: 31.7919, counts: { excludedShortHistory: 6 } });
    });

    it('prints the current HIP-3 reading in pretty output', async () => {
      sdk.state.clients.hyperliquid.hip3.breadthMa!.current.mockResolvedValue(sdkRecord('breadth_ma_hip3_current_n5'));
      expect(await runCli('breadth', 'above-ma', 'current', '--exchange', 'hip3', '--n', '5', '--format', 'pretty')).toBe(0);
      const text = stdoutText();
      expect(text).toContain('Hyperliquid HIP-3 Breadth Above the 5-Day Moving Average');
      expect(text).toContain('Value %: 43.9759');
      expect(text).toContain('Excluded, short history: 2');
      expect(text).toContain('Distance median: -0.009625');
      expect(text).toContain('Final: no');
    });

    it('prints a null percentage and distance as null, never 0', async () => {
      const reading = { ...sdkRecord('breadth_ma_hl_current_n200'), valuePct: null, distance: { p25: null, median: null, p75: null } };
      sdk.state.clients.hyperliquid.breadthMa!.current.mockResolvedValue(reading);
      expect(await runCli('breadth', 'above-ma', 'current', '--exchange', 'hyperliquid', '--n', '200', '--format', 'pretty')).toBe(0);
      const text = stdoutText();
      expect(text).toContain('Value %: null');
      expect(text).toContain('Distance median: null');
    });

    it('pages history with --n, the window, interval, limit and cursor', async () => {
      const page = sdkPage('breadth_ma_hl_n50_1h_page1');
      sdk.state.clients.hyperliquid.breadthMa!.history.mockResolvedValue(page);
      const code = await runCli(
        'breadth', 'above-ma', 'history', '--exchange', 'hyperliquid', '--n', '50',
        '--start', START, '--end', END, '--interval', '1h', '--limit', '3', '--cursor', '1793577600000',
      );
      expect(code).toBe(0);
      expect(sdk.state.clients.hyperliquid.breadthMa!.history).toHaveBeenCalledWith({
        n: 50,
        start: START_MS,
        end: END_MS,
        interval: '1h',
        limit: 3,
        cursor: '1793577600000',
      });
      expect(stdoutJson()).toEqual({ data: page.data, nextCursor: '1793588400000', has_more: true });
    });

    it('keeps the coverage notice of a window before the length\'s first reading', async () => {
      sdk.state.clients.hyperliquid.breadthMa!.history.mockResolvedValue(sdkPage('breadth_ma_before_coverage'));
      expect(await runCli('breadth', 'above-ma', 'history', '--exchange', 'hyperliquid', '--n', '200', '--interval', '1d')).toBe(0);
      expect(stdoutJson()).toEqual({
        data: [],
        nextCursor: null,
        has_more: false,
        meta: {
          coverageFrom: '2025-10-08T00:00:00Z',
          notice:
            'No data in the requested range. Hyperliquid breadth above the 200-day moving average begins 2025-10-08 00:00 UTC; the requested window ends before then.',
        },
      });
    });

    it('prints history in pretty output', async () => {
      sdk.state.clients.hyperliquid.breadthMa!.history.mockResolvedValue(sdkPage('breadth_ma_hl_n50_1h_page1'));
      expect(await runCli('breadth', 'above-ma', 'history', '--exchange', 'hyperliquid', '--n', '50', '--format', 'pretty')).toBe(0);
      const text = stdoutText();
      expect(text).toContain('Hyperliquid Breadth Above the 50-Day Moving Average (3 buckets)');
      expect(text).toContain('5.0562');
      expect(text).toContain('rerun with --cursor 1793588400000');
    });

    it('leaves breadth above the session VWAP where it was', async () => {
      sdk.state.clients.hyperliquid.breadth.current.mockResolvedValue({ valuePct: 50 });
      expect(await runCli('breadth', 'current', '--exchange', 'hyperliquid')).toBe(0);
      expect(sdk.state.clients.hyperliquid.breadth.current).toHaveBeenCalledWith();
      expect(sdk.state.clients.hyperliquid.breadthMa!.current).not.toHaveBeenCalled();
    });

    it.each([
      [['current', '--exchange', 'hyperliquid'], '--n is required: the moving average\'s length in days, 5, 20, 50, or 200.'],
      [['history', '--exchange', 'hip3'], '--n is required: the moving average\'s length in days, 5, 20, 50, or 200.'],
      [['current', '--exchange', 'hyperliquid', '--n', '7'], 'Invalid --n "7". Must be 5, 20, 50, or 200.'],
      [['current', '--exchange', 'lighter', '--n', '5'], 'Lighter has no moving-average breadth endpoint. Use --exchange hyperliquid or hip3.'],
      [['history', '--exchange', 'hyperliquid', '--n', '5', '--interval', '1s'], 'Invalid interval "1s". Must be one of: 1m, 5m, 15m, 30m, 1h, 4h, 1d'],
      [['history', '--exchange', 'hyperliquid', '--n', '5', '--limit', '0'], '--limit must be a whole number from 1 to 1000 (got 0)'],
    ])('refuses %j before any request', async (args, message) => {
      expect(await runCli('breadth', 'above-ma', ...args)).toBe(2);
      expect(lastError()).toEqual({ error: message, code: 2, type: 'validation' });
      expect(sdk.state.clients.hyperliquid.breadthMa!.current).not.toHaveBeenCalled();
      expect(sdk.state.clients.hyperliquid.breadthMa!.history).not.toHaveBeenCalled();
    });
  });

  describe('oxa positioning current', () => {
    it('reads the cross-section for --window and keeps the close it is as of', async () => {
      const page = sdkPage('positioning_hl_4h');
      sdk.state.clients.hyperliquid.positioning!.current.mockResolvedValue(page);
      expect(await runCli('positioning', 'current', '--exchange', 'hyperliquid', '--window', '4h')).toBe(0);
      expect(sdk.state.clients.hyperliquid.positioning!.current).toHaveBeenCalledWith({ window: '4h' });
      const out = stdoutJson();
      expect(out.data).toEqual(page.data);
      expect(out.data[0]).toMatchObject({ symbol: '0G', window: '4h', oiStart: 6731236.0, typicalWindows: 1952 });
      expect(out).toMatchObject({ nextCursor: null, has_more: false, meta: { asOf: '2026-11-04T20:00:00.000Z' } });
    });

    it('reads HIP-3 positioning from the HIP-3 client and prints it in pretty output', async () => {
      sdk.state.clients.hyperliquid.hip3.positioning!.current.mockResolvedValue(sdkPage('positioning_hip3_1h'));
      expect(await runCli('positioning', 'current', '--exchange', 'hip3', '--window', '1h', '--format', 'pretty')).toBe(0);
      expect(sdk.state.clients.hyperliquid.positioning!.current).not.toHaveBeenCalled();
      const text = stdoutText();
      expect(text).toContain('Hyperliquid HIP-3 Positioning, 1h window (3 markets)');
      expect(text).toContain('As of: 2026-11-04T19:55:00.000Z');
    });

    it('prints a missing open-interest reading as null, never 0', async () => {
      const page = sdkPage('positioning_hl_4h');
      page.data = [{ ...page.data[0], oiStart: null, markEnd: null, typicalPrice: null }];
      sdk.state.clients.hyperliquid.positioning!.current.mockResolvedValue(page);
      expect(await runCli('positioning', 'current', '--exchange', 'hyperliquid', '--window', '4h', '--format', 'pretty')).toBe(0);
      const row = stdoutText().split('\n').find((line) => line.trim().startsWith('0G'));
      expect(row).toBeDefined();
      expect(row!.split(/\s+/).filter(Boolean)[1]).toBe('null');
    });

    it.each([
      [['--exchange', 'hyperliquid'], '--window is required: the trailing window, 1h, 4h, or 24h.'],
      [['--exchange', 'hyperliquid', '--window', '2h'], 'Invalid --window "2h". Must be 1h, 4h, or 24h.'],
      [['--exchange', 'spot', '--window', '1h'], 'Hyperliquid Spot (--exchange spot) is not served by this command. Must be one of: hyperliquid, lighter, rh-lighter, hip3, hip4. Run "oxa spot --help" for the Spot commands.'],
      [['--exchange', 'rh-lighter', '--window', '1h'], 'Lighter on Robinhood Chain has no positioning endpoint. Use --exchange hyperliquid or hip3.'],
    ])('refuses %j before any request', async (args, message) => {
      expect(await runCli('positioning', 'current', ...args)).toBe(2);
      expect(lastError()).toEqual({ error: message, code: 2, type: 'validation' });
      expect(sdk.state.clients.hyperliquid.positioning!.current).not.toHaveBeenCalled();
    });

    it('exits 4 on a retryable "still being prepared" answer', async () => {
      const { status, body } = recorded('positioning_cold_503');
      sdk.state.clients.hyperliquid.positioning!.current.mockRejectedValue(
        Object.assign(new OxArchiveError(body.error, status, body.request_id), { errorCode: body.error_code }),
      );
      expect(await runCli('positioning', 'current', '--exchange', 'hyperliquid', '--window', '4h')).toBe(4);
      expect(lastError()).toMatchObject({
        error: 'Positioning is still being prepared. Retry in a few seconds.',
        code: 4,
        type: 'network',
        error_code: 'upstream_unavailable',
        status: 503,
      });
    });
  });

  describe('a plan without the dataset (Free)', () => {
    const cases = [
      ['trade_intent_free_forbidden', 'trade_intent', ['trade-intent', 'history', 'BTC', '--exchange', 'hyperliquid'], (c: any) => c.hyperliquid.tradeIntent.history],
      ['usdc_flows_free_forbidden', 'usdc_flows', ['usdc-flows', 'history'], (c: any) => c.hyperliquid.usdcFlows.history],
      ['breadth_ma_free_forbidden', 'breadth_ma', ['breadth', 'above-ma', 'current', '--exchange', 'hyperliquid', '--n', '5'], (c: any) => c.hyperliquid.breadthMa.current],
      ['positioning_free_forbidden', 'positioning', ['positioning', 'current', '--exchange', 'hyperliquid', '--window', '1h'], (c: any) => c.hyperliquid.positioning.current],
    ] as const;

    it.each(cases.flatMap(([fixture, datatype, args, method]) => [
      [fixture, datatype, args, method, true],
      [fixture, datatype, args, method, false],
    ] as const))(
      '%s: exits 3 with the plan message, the plans and the upgrade URL (PlanRequiredError: %s)',
      async (fixture, datatype, args, method, asPlanRequiredError) => {
        const { body } = recorded(fixture);
        method(sdk.state.clients).mockRejectedValue(sdkError(fixture, asPlanRequiredError));
        expect(await runCli(...args)).toBe(3);
        expect(lastError()).toEqual({
          error: body.error,
          code: 3,
          type: 'auth',
          error_code: 'forbidden',
          request_id: body.request_id,
          status: 403,
          datatype,
          required_plans: ['build', 'pro', 'scale', 'enterprise'],
          upgrade_url: 'https://0xarchive.io/pricing',
        });
        expect(lastError().error).toContain('Upgrade at https://0xarchive.io/pricing.');
      },
    );

    it('adds no plan fields to a forbidden error that names no plans', async () => {
      sdk.state.clients.hyperliquid.positioning!.current.mockRejectedValue(
        Object.assign(new OxArchiveError('Forbidden', 403, 'r1'), { errorCode: 'forbidden' }),
      );
      expect(await runCli('positioning', 'current', '--exchange', 'hyperliquid', '--window', '1h')).toBe(3);
      expect(lastError()).toEqual({ error: 'Forbidden', code: 3, type: 'auth', error_code: 'forbidden', request_id: 'r1', status: 403 });
    });
  });

  describe('an SDK install older than the floor', () => {
    it.each([
      [['trade-intent', 'history', 'BTC', '--exchange', 'hip3'], (c: any) => (c.hyperliquid.hip3.tradeIntent = undefined), 'Hyperliquid HIP-3 trade intent'],
      [['usdc-flows', 'volume'], (c: any) => (c.hyperliquid.usdcFlows = undefined), 'USDC flows'],
      [['breadth', 'above-ma', 'current', '--exchange', 'hyperliquid', '--n', '5'], (c: any) => (c.hyperliquid.breadthMa = undefined), 'Hyperliquid moving-average breadth'],
      [['positioning', 'current', '--exchange', 'hip3', '--window', '1h'], (c: any) => (c.hyperliquid.hip3.positioning = undefined), 'Hyperliquid HIP-3 positioning'],
    ])('names the SDK floor for %j', async (args, remove, feature) => {
      remove(sdk.state.clients);
      expect(await runCli(...args)).toBe(5);
      expect(lastError().error).toBe(
        `Support for ${feature} requires @0xarchive/sdk 1.14.0 or newer. Reinstall @0xarchive/cli to pick it up.`,
      );
    });
  });
});
