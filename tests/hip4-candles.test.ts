import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { candlesCommand } from '../src/commands/candles.js';
import { fundingCurrentCommand } from '../src/commands/funding.js';
import { Hip4Client } from '../src/lib/hip4.js';
import { rejectHip4 } from '../src/lib/client.js';

class ProcessExit extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

function interceptExit(): void {
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    if ((code ?? 0) === 0) return undefined as never;
    throw new ProcessExit(code ?? 0);
  }) as never);
}

function fakeApiResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

describe('HIP-4 candle coverage', () => {
  beforeEach(() => {
    vi.stubEnv('OXA_API_KEY', 'test-key');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('requests the HIP-4 candles route and preserves cursor metadata', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        fakeApiResponse({
          success: true,
          data: [
            {
              timestamp: '2026-05-02T00:00:00Z',
              open: 0.4,
              high: 0.5,
              low: 0.3,
              close: 0.45,
              volume: 120,
            },
          ],
          meta: { count: 1, next_cursor: 'next-page', request_id: 'req-1' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new Hip4Client('test-key', { baseUrl: 'https://api.test' });
    const result = await client.candles.history('0', {
      start: 1777680000000,
      end: 1777683600000,
      interval: '1h',
      limit: 100,
      cursor: 'page-1',
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/v1/hyperliquid/hip4/candles/0');
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      start: '1777680000000',
      end: '1777683600000',
      interval: '1h',
      limit: '100',
      cursor: 'page-1',
    });
    expect(result).toEqual({
      data: [
        {
          timestamp: '2026-05-02T00:00:00Z',
          open: 0.4,
          high: 0.5,
          low: 0.3,
          close: 0.45,
          volume: 120,
        },
      ],
      nextCursor: 'next-page',
    });
  });

  it('allows valid HIP-4 candle CLI requests while retaining range validation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        fakeApiResponse({
          success: true,
          data: [],
          meta: { count: 0, request_id: 'req-2' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    interceptExit();

    await expect(
      candlesCommand({
        exchange: 'hip4',
        symbol: '0',
        start: '2026-05-02T00:00:00Z',
        end: '2026-05-02T01:00:00Z',
        interval: '1h',
        format: 'json',
        apiKey: 'test-key',
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe(
      '/v1/hyperliquid/hip4/candles/0',
    );
  });

  it('keeps HIP-4 funding rejected before any network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    interceptExit();

    await expect(
      fundingCurrentCommand({
        exchange: 'hip4',
        symbol: '0',
        format: 'json',
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({ code: 2 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps invalid candle intervals rejected for HIP-4', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    interceptExit();

    await expect(
      candlesCommand({
        exchange: 'hip4',
        symbol: '0',
        start: '2026-05-02T00:00:00Z',
        end: '2026-05-02T01:00:00Z',
        interval: '10m',
        format: 'json',
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({ code: 2 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the executable version aligned with the package release', () => {
    const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
    const cliSource = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');
    expect(cliSource).toContain(`const VERSION = '${packageVersion}'`);
  });

  it('points unsupported HIP-4 resources to accepted exchange names', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => rejectHip4('hip4', 'funding')).toThrow('process.exit unexpectedly called');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Use --exchange hyperliquid or hip3.'),
    );
  });
});
