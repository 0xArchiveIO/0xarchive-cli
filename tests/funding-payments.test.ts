import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { positionsFundingPaymentsCommand } from '../src/commands/positions.js';
import { WalletFundingClient } from '../src/lib/funding-payments.js';
import { captureIo, lastError, ProcessExit, runCli, stdoutJson, stdoutText } from './helpers.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const START = '2026-11-06T00:00:00Z';
const END = '2026-11-06T02:00:00Z';

// A real response from GET /v1/hyperliquid/wallets/{address}/funding.
const REAL_RESPONSE = {
  success: true,
  data: [
    {
      timestamp: '2026-11-06T00:00:00.025Z',
      symbol: 'BTC',
      coin: 'BTC',
      position_size: '-2328.12331',
      funding_rate: '0.0000125',
      funding_amount: '2214.350833',
      direction: 'received',
      block_number: 1210632898,
    },
    {
      timestamp: '2026-11-06T01:00:00.095Z',
      symbol: 'BTC',
      coin: 'BTC',
      position_size: '-2328.12331',
      funding_rate: '0.0000125',
      funding_amount: '2221.407957',
      direction: 'received',
      block_number: 1210684428,
    },
  ],
  meta: { count: 2, request_id: '8e554265-976e-43d5-bd3a-1322ec83c8f0', source: 'funding', has_more: false },
};

function response(payload: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

function stubFetch(payload: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(response(payload, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('oxa positions funding-payments', () => {
  beforeEach(() => {
    vi.stubEnv('OXA_API_KEY', 'test-key');
    captureIo();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reads the core wallet funding route and prints the envelope', async () => {
    const fetchMock = stubFetch(REAL_RESPONSE);

    await positionsFundingPaymentsCommand({
      exchange: 'hyperliquid',
      address: WALLET,
      start: START,
      end: END,
      symbol: 'BTC',
      limit: '100',
      format: 'json',
    });

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe(`/v1/hyperliquid/wallets/${WALLET}/funding`);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      start: String(Date.parse(START)),
      end: String(Date.parse(END)),
      symbol: 'BTC',
      limit: '100',
    });
    expect(init.headers['X-API-Key']).toBe('test-key');

    const out = stdoutJson();
    expect(out.has_more).toBe(false);
    expect(out.nextCursor).toBeNull();
    expect(out.meta.source).toBe('funding');
    expect(out.data).toHaveLength(2);
    expect(out.data[0]).toMatchObject({
      timestamp: '2026-11-06T00:00:00.025Z',
      symbol: 'BTC',
      positionSize: '-2328.12331',
      fundingRate: '0.0000125',
      fundingAmount: '2214.350833',
      direction: 'received',
      blockNumber: 1210632898,
    });
  });

  it('reads the HIP-3 route with dex and cursor', async () => {
    const fetchMock = stubFetch({
      success: true,
      data: [
        {
          timestamp: '2026-11-06T00:00:00.025Z',
          symbol: 'xyz:GOLD',
          coin: 'xyz:GOLD',
          dex: 'xyz',
          position_size: '3.5',
          funding_rate: '0.00001',
          funding_amount: '-0.5',
          direction: 'paid',
        },
      ],
      meta: { count: 1, source: 'funding', has_more: true, next_cursor: 'c2' },
    });

    await positionsFundingPaymentsCommand({
      exchange: 'hip3',
      address: WALLET,
      start: START,
      end: END,
      dex: 'xyz',
      symbol: 'xyz:GOLD',
      cursor: 'c1',
      format: 'json',
    });

    const parsed = new URL(String(fetchMock.mock.calls[0][0]));
    expect(parsed.pathname).toBe(`/v1/hyperliquid/hip3/wallets/${WALLET}/funding`);
    expect(parsed.searchParams.get('dex')).toBe('xyz');
    expect(parsed.searchParams.get('symbol')).toBe('xyz:GOLD');
    expect(parsed.searchParams.get('cursor')).toBe('c1');
    const out = stdoutJson();
    expect(out.nextCursor).toBe('c2');
    expect(out.has_more).toBe(true);
    expect(out.data[0].dex).toBe('xyz');
  });

  it('passes the coverage notice through for a window before coverage starts', async () => {
    stubFetch({
      success: true,
      data: [],
      meta: { count: 0, coverage_from: '2025-09-27T10:00:00Z', notice: 'No data before coverage starts.', has_more: false },
    });

    await positionsFundingPaymentsCommand({
      exchange: 'hyperliquid',
      address: WALLET,
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-02T00:00:00Z',
      format: 'json',
    });

    const out = stdoutJson();
    expect(out.data).toEqual([]);
    expect(out.meta.coverageFrom).toBe('2025-09-27T10:00:00Z');
    expect(out.meta.notice).toBe('No data before coverage starts.');
  });

  it('prints a pretty table', async () => {
    stubFetch(REAL_RESPONSE);

    await positionsFundingPaymentsCommand({
      exchange: 'hyperliquid',
      address: WALLET,
      start: START,
      end: END,
      format: 'pretty',
    });

    const out = stdoutText();
    expect(out).toContain('Funding payments for 0x1111...1111');
    expect(out).toContain('2214.350833');
    expect(out).toContain('received');
  });

  it('refuses the Lighter venues before any request', async () => {
    const fetchMock = stubFetch(REAL_RESPONSE);

    for (const exchange of ['lighter', 'rh-lighter']) {
      await expect(
        positionsFundingPaymentsCommand({ exchange, address: WALLET, start: START, end: END, format: 'json' }),
      ).rejects.toBeInstanceOf(ProcessExit);
      expect(lastError().error).toContain('no wallet funding payments endpoint');
      expect(lastError().error).toContain('hyperliquid or hip3');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects --dex on Hyperliquid, a missing address, and an inverted range', async () => {
    const fetchMock = stubFetch(REAL_RESPONSE);
    const base = { exchange: 'hyperliquid', address: WALLET, start: START, end: END, format: 'json' };

    await expect(positionsFundingPaymentsCommand({ ...base, dex: 'xyz' })).rejects.toBeInstanceOf(ProcessExit);
    expect(lastError().error).toContain('--dex applies to --exchange hip3 only');
    await expect(positionsFundingPaymentsCommand({ ...base, address: undefined })).rejects.toBeInstanceOf(ProcessExit);
    expect(lastError().error).toContain('wallet address');
    await expect(positionsFundingPaymentsCommand({ ...base, start: END, end: START })).rejects.toBeInstanceOf(ProcessExit);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the 31-day window error from the API', async () => {
    stubFetch(
      {
        success: false,
        error_code: 'invalid_parameter',
        param: 'start',
        error:
          'Funding payments are served for at most 31 days per request. Narrow start and end, and page through longer histories one window at a time.',
      },
      400,
    );

    await expect(
      positionsFundingPaymentsCommand({
        exchange: 'hyperliquid',
        address: WALLET,
        start: '2026-08-01T00:00:00Z',
        end: '2026-11-01T00:00:00Z',
        format: 'json',
      }),
    ).rejects.toBeInstanceOf(ProcessExit);
    expect(lastError().error).toContain('at most 31 days per request');
  });

  it("names the plans, the upgrade URL, the reason and the last day served on a Free refusal of today's data", async () => {
    stubFetch(
      {
        success: false,
        code: 403,
        error_code: 'forbidden',
        reason: 'today_needs_build',
        data_ends_on: '2026-11-22',
        required_plans: ['build', 'pro', 'scale', 'enterprise'],
        upgrade_url: 'https://0xarchive.io/pricing',
        error: "Free data runs through yesterday. Today's data and live streams need Build.",
        request_id: 'req-today',
      },
      403,
    );

    await expect(
      positionsFundingPaymentsCommand({ exchange: 'hyperliquid', address: WALLET, start: START, end: END, format: 'json' }),
    ).rejects.toMatchObject({ code: 3 });
    expect(lastError()).toMatchObject({
      code: 3,
      error_code: 'forbidden',
      request_id: 'req-today',
      status: 403,
      reason: 'today_needs_build',
      data_ends_on: '2026-11-22',
      required_plans: ['build', 'pro', 'scale', 'enterprise'],
      upgrade_url: 'https://0xarchive.io/pricing',
    });
  });

  it('is registered under oxa positions', async () => {
    const fetchMock = stubFetch(REAL_RESPONSE);

    await runCli(
      'positions', 'funding-payments',
      '--exchange', 'hyperliquid', '--address', WALLET, '--start', START, '--end', END, '--symbol', 'BTC',
    );

    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(`/v1/hyperliquid/wallets/${WALLET}/funding`);
    expect(stdoutJson().data).toHaveLength(2);
  });

  it('client picks the path per venue', async () => {
    const fetchMock = stubFetch({ data: [], meta: {} });
    const client = new WalletFundingClient('k', { baseUrl: 'https://example.test' });
    await client.payments('hip3', WALLET, { start: 1, end: 2 });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://example.test/v1/hyperliquid/hip3/wallets/${WALLET}/funding?start=1&end=2`,
    );
  });
});
