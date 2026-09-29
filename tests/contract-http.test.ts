import * as sdk from '@0xarchive/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureIo, lastError, runCli, stdoutJson } from './helpers.js';
import { API_VERSION } from '../src/lib/http.js';

// The API contract end to end: the installed SDK (and the CLI's own client
// for HIP-4 and Spot candles) against a stubbed fetch, so these tests check
// the request each command sends and how it reads the answer. Checks that need
// the SDK release the CLI requires run only when that release is installed.
const SDK_HAS_CONTRACT = 'API_VERSION' in sdk;

const START = '2026-09-01T00:00:00Z';
const END = '2026-09-02T00:00:00Z';

function json(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const ERROR_BODY = {
  success: false,
  code: 400,
  error_code: 'invalid_symbol',
  error: "The symbol 'NOPE' does not exist.",
  param: 'symbol',
  request_id: 'd05c6a40',
};

function requestUrl(fetchMock: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call][0]));
}

function requestHeaders(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
  return (fetchMock.mock.calls[call][1] as { headers: Record<string, string> }).headers;
}

describe('API contract over HTTP', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    captureIo();
    vi.stubEnv('OXA_API_KEY', 'test-key');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('writes the CLI against the API version the SDK sends', () => {
    expect(API_VERSION).toBe('2026-10-01');
    const sdkVersion = (sdk as unknown as { API_VERSION?: string }).API_VERSION;
    if (sdkVersion !== undefined) expect(sdkVersion).toBe(API_VERSION);
  });

  describe('HIP-4 and Spot candles through the CLI client', () => {
    it('sends the version header and reads has_more from meta', async () => {
      fetchMock.mockResolvedValue(
        json(200, { success: true, data: [{ tid: 1 }], meta: { count: 1, has_more: true, next_cursor: 'c2', request_id: 'r' } }),
      );
      expect(await runCli('hip4', 'trades', '42', '--start', START, '--end', END, '--side', 'sell')).toBe(0);
      expect(requestHeaders(fetchMock)).toMatchObject({ '0xArchive-Version': '2026-10-01', 'X-API-Key': 'test-key' });
      const url = requestUrl(fetchMock);
      expect(url.pathname).toBe('/v1/hyperliquid/hip4/trades/42');
      expect(url.searchParams.get('side')).toBe('sell');
      expect(stdoutJson()).toEqual({ data: [{ tid: 1 }], nextCursor: 'c2', has_more: true });
    });

    it('sends --side on HIP-4 recent trades', async () => {
      fetchMock.mockResolvedValue(json(200, { success: true, data: [], meta: { count: 0, has_more: false } }));
      expect(await runCli('trades', 'history', '--exchange', 'hip4', '--symbol', '42', '--side', 'buy', '--limit', '5')).toBe(0);
      const url = requestUrl(fetchMock);
      expect(url.pathname).toBe('/v1/hyperliquid/hip4/trades/42/recent');
      expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '5', side: 'buy' });
    });

    it('sends --triggered on HIP-4 order history', async () => {
      fetchMock.mockResolvedValue(json(200, { success: true, data: [], meta: { count: 0, has_more: false } }));
      expect(await runCli('hip4', 'orders', 'history', '42', '--start', START, '--end', END, '--triggered', 'true')).toBe(0);
      expect(requestUrl(fetchMock).searchParams.get('triggered')).toBe('true');
    });

    it('sends --depth on HIP-4 order book history', async () => {
      fetchMock.mockResolvedValue(json(200, { success: true, data: [], meta: { count: 0, has_more: false } }));
      expect(
        await runCli('orderbook', 'history', '--exchange', 'hip4', '--symbol', '42', '--start', START, '--end', END, '--depth', '3'),
      ).toBe(0);
      const url = requestUrl(fetchMock);
      expect(url.pathname).toBe('/v1/hyperliquid/hip4/orderbook/42/history');
      expect(url.searchParams.get('depth')).toBe('3');
      expect(stdoutJson()).toEqual({ data: [], nextCursor: null, has_more: false });
    });

    it('prints the error_code, request id, and parameter of a failure', async () => {
      fetchMock.mockResolvedValue(json(400, ERROR_BODY));
      expect(await runCli('hip4', 'summary', 'NOPE')).toBe(2);
      expect(lastError()).toEqual({
        error: "The symbol 'NOPE' does not exist.",
        code: 2,
        type: 'validation',
        error_code: 'invalid_symbol',
        request_id: 'd05c6a40',
        status: 400,
        param: 'symbol',
      });
    });

    it('keeps the HTTP status of a non-JSON error body', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } } as unknown as Response);
      expect(await runCli('spot', 'candles', 'HYPE-USDC', '--start', START, '--end', END)).toBe(4);
      expect(lastError()).toEqual({ error: 'Request failed with status 502', code: 4, type: 'network' });
    });

    it('reads has_more on Spot candles, including through `oxa candles --exchange spot`', async () => {
      fetchMock.mockResolvedValue(
        json(200, { success: true, data: [], meta: { count: 0, has_more: true, next_cursor: 'opaque' } }),
      );
      expect(await runCli('candles', 'history', '--exchange', 'spot', '--symbol', 'HYPE-USDC', '--start', START, '--end', END)).toBe(0);
      expect(requestUrl(fetchMock).pathname).toBe('/v1/hyperliquid/spot/candles/HYPE-USDC');
      expect(requestHeaders(fetchMock)).toMatchObject({ '0xArchive-Version': '2026-10-01' });
      expect(stdoutJson()).toEqual({ data: [], nextCursor: 'opaque', has_more: true });
    });
  });

  describe.runIf(SDK_HAS_CONTRACT)('through the SDK', () => {
    it('sends the version header and prints the error_code of a failure', async () => {
      fetchMock.mockResolvedValue(json(400, ERROR_BODY));
      expect(
        await runCli('trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'NOPE', '--start', START, '--end', END),
      ).toBe(2);
      expect(requestHeaders(fetchMock)).toMatchObject({ '0xArchive-Version': '2026-10-01' });
      expect(lastError()).toEqual({
        error: "The symbol 'NOPE' does not exist.",
        code: 2,
        type: 'validation',
        error_code: 'invalid_symbol',
        request_id: 'd05c6a40',
        status: 400,
        param: 'symbol',
      });
    });

    it('prints valid_values when the API lists them', async () => {
      fetchMock.mockResolvedValue(
        json(400, {
          success: false,
          code: 400,
          error_code: 'invalid_interval',
          error: 'Invalid interval 7m.',
          param: 'interval',
          valid_values: ['1m', '5m', '1h'],
          request_id: 'r-int',
        }),
      );
      expect(
        await runCli('funding', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END, '--interval', '5m'),
      ).toBe(2);
      expect(lastError()).toMatchObject({ error_code: 'invalid_interval', param: 'interval', valid_values: ['1m', '5m', '1h'] });
    });

    it('sends --side on trade history and reads has_more', async () => {
      fetchMock.mockResolvedValue(
        json(200, {
          success: true,
          data: [{ coin: 'BTC', side: 'A', px: '1', sz: '2', time: '2026-09-01T00:00:00Z', tid: 7 }],
          meta: { count: 1, has_more: true, next_cursor: '1790_1', symbol: 'BTC', venue: 'hyperliquid', request_id: 'r' },
        }),
      );
      expect(
        await runCli('trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END, '--side', 'sell'),
      ).toBe(0);
      expect(requestUrl(fetchMock).searchParams.get('side')).toBe('sell');
      expect(stdoutJson()).toMatchObject({ nextCursor: '1790_1', has_more: true });
    });

    it('sends --side on recent trades as the SDK params form', async () => {
      fetchMock.mockResolvedValue(json(200, { success: true, data: [], meta: { count: 0, has_more: false } }));
      expect(await runCli('trades', 'history', '--exchange', 'spot', '--symbol', 'HYPE-USDC', '--side', 'buy', '--limit', '20')).toBe(0);
      const url = requestUrl(fetchMock);
      expect(url.pathname).toBe('/v1/hyperliquid/spot/trades/HYPE-USDC/recent');
      expect(url.searchParams.get('side')).toBe('buy');
      expect(url.searchParams.get('limit')).toBe('20');
    });

    it('sends --triggered and --depth', async () => {
      fetchMock.mockResolvedValue(json(200, { success: true, data: [], meta: { count: 0, has_more: false } }));
      expect(
        await runCli('orders', 'history', '--exchange', 'hip3', '--symbol', 'xyz:TSLA', '--start', START, '--end', END, '--triggered', 'false'),
      ).toBe(0);
      expect(requestUrl(fetchMock, 0).pathname).toBe('/v1/hyperliquid/hip3/orders/xyz:TSLA/history');
      expect(requestUrl(fetchMock, 0).searchParams.get('triggered')).toBe('false');

      expect(
        await runCli('l2', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', START, '--end', END, '--depth', '5'),
      ).toBe(0);
      expect(requestUrl(fetchMock, 1).pathname).toBe('/v1/hyperliquid/orderbook/BTC/l2/history');
      expect(requestUrl(fetchMock, 1).searchParams.get('depth')).toBe('5');
    });

    it('reads /v1/capabilities through the SDK', async () => {
      fetchMock.mockResolvedValue(
        json(200, {
          success: true,
          data: [
            {
              venue: 'spot',
              datatype: 'l4_diffs',
              rest_routes: ['/v1/hyperliquid/spot/orderbook/{symbol}/l4/diffs'],
              ws_channels: ['spot_l4_diffs'],
              live: true,
              replay: true,
              available_from: '2026-03-11T01:03:00.000Z',
              cadence: 'event',
              page_limit: 10000,
              intervals: [],
              notes: null,
            },
          ],
          meta: { count: 1, request_id: 'caps' },
        }),
      );
      expect(await runCli('capabilities')).toBe(0);
      expect(requestUrl(fetchMock).pathname).toBe('/v1/capabilities');
      expect(stdoutJson()).toEqual([
        {
          venue: 'spot',
          datatype: 'l4_diffs',
          restRoutes: ['/v1/hyperliquid/spot/orderbook/{symbol}/l4/diffs'],
          wsChannels: ['spot_l4_diffs'],
          live: true,
          replay: true,
          availableFrom: '2026-03-11T01:03:00.000Z',
          cadence: 'event',
          pageLimit: 10000,
          intervals: [],
          notes: null,
        },
      ]);
    });
  });
});
