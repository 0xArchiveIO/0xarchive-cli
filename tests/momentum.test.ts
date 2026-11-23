import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  momentumCurrentCommand,
  momentumGetCommand,
  momentumReturnsCommand,
} from '../src/commands/momentum.js';
import { MomentumClient } from '../src/lib/momentum.js';
import { captureIo, lastError, ProcessExit, runCli, stdoutJson, stdoutText } from './helpers.js';

// Responses of GET /v1/hyperliquid/factors/momentum, /current and /returns,
// recorded from the API (tests/fixtures/momentum; score lists trimmed), with
// the request each answers.
interface Fixture {
  request: { path: string; query: Record<string, unknown> };
  status: number;
  body: any;
}

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`./fixtures/momentum/${name}.json`, import.meta.url), 'utf8'));
}

function stubFetch(f: Fixture) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: f.status < 400, status: f.status, json: async () => f.body } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The path and query string of the request the command sent. */
function sent(fetchMock: ReturnType<typeof vi.fn>, call = 0): { path: string; query: Record<string, string> } {
  const url = new URL(String(fetchMock.mock.calls[call][0]));
  return { path: url.pathname, query: Object.fromEntries(url.searchParams) };
}

/** The fixture's request query as the strings a URL carries. */
function asQuery(query: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)]));
}

const SCORES = fixture('scores_7d_at');
const CURRENT = fixture('current_14d');
const RETURNS_PAGE = fixture('returns_7d_top25_1d_page1');
const RETURNS_HOLDINGS = fixture('returns_14d_top50_1h_holdings');

describe('oxa factors momentum', () => {
  beforeEach(() => {
    vi.stubEnv('OXA_API_KEY', 'test-key');
    captureIo();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('get', () => {
    it('reads one hour of scores with --lookback and --at, strongest first', async () => {
      const fetchMock = stubFetch(SCORES);
      const at = Number(SCORES.request.query.at);

      await momentumGetCommand({
        exchange: 'hyperliquid',
        lookback: '7d',
        at: new Date(at).toISOString(),
        format: 'json',
      });

      expect(sent(fetchMock)).toEqual({ path: SCORES.request.path, query: asQuery(SCORES.request.query) });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers['X-API-Key']).toBe('test-key');
      expect(init.headers['0xArchive-Version']).toBe('2026-10-01');

      const out = stdoutJson();
      expect(out.has_more).toBe(false);
      expect(out.nextCursor).toBeNull();
      expect(out.meta).toBeUndefined();
      expect(out.data).toHaveLength(SCORES.body.data.length);
      const first = SCORES.body.data[0];
      expect(out.data[0]).toEqual({
        symbol: first.symbol,
        timestamp: first.timestamp,
        timestampMs: first.timestamp_ms,
        lookback: '7d',
        method: first.method,
        ret: first.ret,
        vol: first.vol,
        score: first.score,
        pctRank: first.pct_rank,
        quintile: first.quintile,
        inTop25: first.in_top25,
        inTop50: first.in_top50,
        isFinal: first.is_final,
      });
      // Strongest first, as served.
      const served = out.data.map((r: { score: number }) => r.score);
      expect(served).toEqual([...served].sort((a, b) => b - a));
    });

    it('prints a pretty table', async () => {
      stubFetch(SCORES);
      await momentumGetCommand({ exchange: 'hyperliquid', lookback: '7d', format: 'pretty' });
      const out = stdoutText();
      expect(out).toContain(`Hyperliquid Momentum, 7d lookback (${SCORES.body.data.length} perps)`);
      expect(out).toContain(SCORES.body.data[0].timestamp);
      expect(out).toContain(SCORES.body.data[0].symbol);
      expect(out).toContain('Pct Rank');
      expect(out).toContain('momentum/1');
    });

    it('is registered as oxa factors momentum get', async () => {
      const fetchMock = stubFetch(SCORES);
      await runCli('factors', 'momentum', 'get', '--lookback', '7d', '--at', String(SCORES.request.query.at));
      expect(sent(fetchMock)).toEqual({ path: SCORES.request.path, query: asQuery(SCORES.request.query) });
      expect(stdoutJson().data).toHaveLength(SCORES.body.data.length);
    });
  });

  describe('current', () => {
    it('sends only --lookback', async () => {
      const fetchMock = stubFetch(CURRENT);
      await momentumCurrentCommand({ exchange: 'hyperliquid', lookback: '14d', format: 'json' });
      expect(sent(fetchMock)).toEqual({ path: CURRENT.request.path, query: { lookback: '14d' } });
      const out = stdoutJson();
      expect(out.data).toHaveLength(CURRENT.body.data.length);
      expect(out.data[0].lookback).toBe('14d');
      expect(out.data[0].isFinal).toBe(CURRENT.body.data[0].is_final);
    });

    it('is registered as oxa factors momentum current and takes no --at', async () => {
      const fetchMock = stubFetch(CURRENT);
      await runCli('factors', 'momentum', 'current', '--lookback', '14d', '--format', 'pretty');
      expect(sent(fetchMock).path).toBe('/v1/hyperliquid/factors/momentum/current');
      expect(stdoutText()).toContain('newest reading, 14d lookback');

      vi.mocked(process.stdout.write).mockClear();
      fetchMock.mockClear();
      const code = await runCli('factors', 'momentum', 'current', '--lookback', '14d', '--at', '1');
      expect(code).not.toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('returns', () => {
    it('sends every flag and passes the cursor on', async () => {
      const fetchMock = stubFetch(RETURNS_PAGE);
      const q = RETURNS_PAGE.request.query;

      const flags = {
        exchange: 'hyperliquid',
        lookback: String(q.lookback),
        universe: String(q.universe),
        start: String(q.start),
        end: String(q.end),
        interval: String(q.interval),
        limit: String(q.limit),
        format: 'json',
      };
      await momentumReturnsCommand(flags);

      expect(sent(fetchMock)).toEqual({ path: RETURNS_PAGE.request.path, query: asQuery(q) });
      const out = stdoutJson();
      expect(out.has_more).toBe(true);
      expect(out.nextCursor).toBe(RETURNS_PAGE.body.meta.next_cursor);
      const first = RETURNS_PAGE.body.data[0];
      expect(out.data[0]).toEqual({
        timestamp: first.timestamp,
        timestampMs: first.timestamp_ms,
        calculatedAt: first.calculated_at,
        calculatedAtMs: first.calculated_at_ms,
        lookback: '7d',
        universe: 'top25',
        method: first.method,
        ret: first.ret,
        longRet: first.long_ret,
        shortRet: first.short_ret,
        hours: first.hours,
        longs: first.longs,
        shorts: first.shorts,
        isFinal: first.is_final,
      });
      expect(out.data[0].holdings).toBeUndefined();

      // The next page: the same flags plus --cursor.
      vi.mocked(process.stdout.write).mockClear();
      await momentumReturnsCommand({ ...flags, cursor: out.nextCursor });
      expect(sent(fetchMock, 1).query).toEqual({ ...asQuery(q), cursor: RETURNS_PAGE.body.meta.next_cursor });
    });

    it('sends --universe, --interval and --holdings, and keeps the weights', async () => {
      const fetchMock = stubFetch(RETURNS_HOLDINGS);
      const q = RETURNS_HOLDINGS.request.query;

      await runCli(
        'factors', 'momentum', 'returns',
        '--lookback', '14d', '--universe', 'top50', '--interval', '1h',
        '--start', String(q.start), '--end', String(q.end), '--holdings',
      );

      expect(sent(fetchMock)).toEqual({ path: RETURNS_HOLDINGS.request.path, query: asQuery(q) });
      const out = stdoutJson();
      expect(out.has_more).toBe(false);
      expect(out.data[0].universe).toBe('top50');
      expect(out.data[0].holdings).toEqual(RETURNS_HOLDINGS.body.data[0].holdings);
      const weights = out.data[0].holdings.map((h: { weight: number }) => h.weight);
      expect(weights.some((w: number) => w > 0)).toBe(true);
      expect(weights.some((w: number) => w < 0)).toBe(true);
    });

    it('sends no holdings parameter without --holdings', async () => {
      const fetchMock = stubFetch(RETURNS_PAGE);
      await runCli('factors', 'momentum', 'returns', '--lookback', '7d');
      expect(sent(fetchMock).query).toEqual({ lookback: '7d' });
    });

    it('prints a pretty table with the next-page hint', async () => {
      stubFetch(RETURNS_PAGE);
      await momentumReturnsCommand({ exchange: 'hyperliquid', lookback: '7d', format: 'pretty' });
      const out = stdoutText();
      expect(out).toContain(`Momentum Factor Returns, 7d lookback, top25 (${RETURNS_PAGE.body.data.length} buckets)`);
      expect(out).toContain(RETURNS_PAGE.body.data[0].timestamp);
      expect(out).toContain(`--cursor ${RETURNS_PAGE.body.meta.next_cursor}`);
    });

    it('counts the holdings in pretty output', async () => {
      stubFetch(RETURNS_HOLDINGS);
      await momentumReturnsCommand({ exchange: 'hyperliquid', lookback: '14d', holdings: true, format: 'pretty' });
      const out = stdoutText();
      expect(out).toContain('Holdings');
      expect(out).toContain('in the JSON output');
    });

    it('passes the coverage notice through for a window before coverage starts', async () => {
      const before = fixture('returns_before_coverage');
      stubFetch(before);
      await momentumReturnsCommand({
        exchange: 'hyperliquid',
        lookback: '7d',
        start: String(before.request.query.start),
        end: String(before.request.query.end),
        format: 'json',
      });
      const out = stdoutJson();
      expect(out.data).toEqual([]);
      expect(out.has_more).toBe(false);
      expect(out.meta).toEqual({ coverageFrom: '2025-05-24T01:00:00Z', notice: before.body.meta.notice });
    });

    it('writes the page to --out with a summary', async () => {
      stubFetch(RETURNS_PAGE);
      const { mkdtempSync, rmSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const dir = mkdtempSync(join(tmpdir(), 'oxa-momentum-'));
      try {
        const out = join(dir, 'returns.json');
        await momentumReturnsCommand({ exchange: 'hyperliquid', lookback: '7d', out, format: 'json' });
        expect(stdoutJson()).toMatchObject({
          written_to: out,
          records: RETURNS_PAGE.body.data.length,
          exchange: 'hyperliquid',
          lookback: '7d',
          universe: 'top25',
          has_more: true,
          nextCursor: RETURNS_PAGE.body.meta.next_cursor,
        });
        expect(JSON.parse(readFileSync(out, 'utf8')).data).toHaveLength(RETURNS_PAGE.body.data.length);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('validation before any request', () => {
    it('requires --lookback and takes only 7d or 14d', async () => {
      const fetchMock = stubFetch(SCORES);
      for (const run of [
        () => momentumGetCommand({ exchange: 'hyperliquid', format: 'json' }),
        () => momentumCurrentCommand({ exchange: 'hyperliquid', format: 'json' }),
        () => momentumReturnsCommand({ exchange: 'hyperliquid', format: 'json' }),
      ]) {
        await expect(run()).rejects.toBeInstanceOf(ProcessExit);
        expect(lastError()).toMatchObject({ code: 2 });
        expect(lastError().error).toContain('--lookback is required');
      }
      for (const bad of ['1d', '28d', '7', '14D']) {
        await expect(momentumGetCommand({ exchange: 'hyperliquid', lookback: bad, format: 'json' })).rejects.toBeInstanceOf(
          ProcessExit,
        );
        expect(lastError().error).toContain('Must be 7d or 14d');
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('serves Hyperliquid only', async () => {
      const fetchMock = stubFetch(SCORES);
      for (const exchange of ['hip3', 'hip4', 'lighter', 'rh-lighter']) {
        await expect(momentumCurrentCommand({ exchange, lookback: '7d', format: 'json' })).rejects.toBeInstanceOf(
          ProcessExit,
        );
        expect(lastError().error).toContain('has no momentum factor endpoint');
        expect(lastError().error).toContain('--exchange hyperliquid');
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('checks --universe, --interval, --limit and the window order', async () => {
      const fetchMock = stubFetch(RETURNS_PAGE);
      const base = { exchange: 'hyperliquid', lookback: '7d', format: 'json' };
      const cases: [Record<string, string>, string][] = [
        [{ universe: 'top100' }, 'Must be top25 or top50'],
        [{ interval: '4h' }, 'Must be 1h or 1d'],
        [{ limit: '1001' }, '--limit must be a whole number from 1 to 1000'],
        [{ limit: '0' }, '--limit must be a whole number from 1 to 1000'],
        [{ start: '2026-11-10T00:00:00Z', end: '2026-11-01T00:00:00Z' }, '--start must not be after --end'],
        [{ start: 'yesterday' }, '--start must be a valid ISO date or Unix timestamp'],
      ];
      for (const [flags, message] of cases) {
        await expect(momentumReturnsCommand({ ...base, ...flags })).rejects.toBeInstanceOf(ProcessExit);
        expect(lastError()).toMatchObject({ code: 2 });
        expect(lastError().error).toContain(message);
      }
      await expect(momentumGetCommand({ ...base, at: 'not-a-time' })).rejects.toBeInstanceOf(ProcessExit);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('API errors', () => {
    it('names the plans and the upgrade URL on a Free refusal (exit code 3)', async () => {
      const refusal = fixture('free_forbidden');
      stubFetch(refusal);
      await expect(momentumCurrentCommand({ exchange: 'hyperliquid', lookback: '7d', format: 'json' })).rejects.toMatchObject({
        code: 3,
      });
      expect(lastError()).toMatchObject({
        code: 3,
        type: 'auth',
        error_code: 'forbidden',
        status: 403,
        request_id: refusal.body.request_id,
        datatype: 'momentum',
        required_plans: ['build', 'pro', 'scale', 'enterprise'],
        upgrade_url: refusal.body.upgrade_url,
      });
    });

    it('keeps the API refusal of a lookback with its valid values (exit code 2)', async () => {
      const invalid = fixture('invalid_lookback');
      stubFetch(invalid);
      // Sent past local validation, as a client on an older CLI would.
      const client = new MomentumClient('test-key');
      await expect(client.get({ lookback: '28d' as '7d' })).rejects.toMatchObject({
        code: 400,
        errorCode: 'invalid_parameter',
        param: 'lookback',
        validValues: ['7d', '14d'],
      });
    });

    it('keeps the API refusal of a request without a lookback', async () => {
      stubFetch(fixture('missing_lookback'));
      const client = new MomentumClient('test-key');
      await expect(client.get({} as { lookback: '7d' })).rejects.toMatchObject({
        code: 400,
        errorCode: 'invalid_parameter',
        param: 'lookback',
        validValues: ['7d', '14d'],
      });
    });

    it('exits with code 4 on a retryable 503 while the factor is being prepared', async () => {
      const cold = fixture('cold_503');
      stubFetch(cold);
      await expect(momentumCurrentCommand({ exchange: 'hyperliquid', lookback: '7d', format: 'json' })).rejects.toMatchObject({
        code: 4,
      });
      expect(lastError()).toMatchObject({ code: 4, status: 503, request_id: cold.body.request_id });
      expect(lastError().error).toContain('Retry in a few seconds');
    });
  });

  it('client builds each route on the base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], meta: {} }) });
    vi.stubGlobal('fetch', fetchMock);
    const client = new MomentumClient('k', { baseUrl: 'https://example.test' });
    await client.get({ lookback: '7d', at: 1 });
    await client.current({ lookback: '14d' });
    await client.returns({ lookback: '7d', universe: 'top50', interval: '1h', holdings: true });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.test/v1/hyperliquid/factors/momentum?lookback=7d&at=1',
      'https://example.test/v1/hyperliquid/factors/momentum/current?lookback=14d',
      'https://example.test/v1/hyperliquid/factors/momentum/returns?lookback=7d&universe=top50&interval=1h&holdings=true',
    ]);
  });
});
