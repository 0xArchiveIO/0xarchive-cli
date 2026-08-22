import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spotCandles } from '../src/commands/spot.js';
import { SpotCandlesClient } from '../src/lib/spot-candles.js';

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

describe('Hyperliquid Spot candle coverage', () => {
  beforeEach(() => {
    vi.stubEnv('OXA_API_KEY', 'test-key');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('routes Spot candles and preserves opaque cursor metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeApiResponse({
        success: true,
        data: [
          {
            timestamp: '2025-03-22T10:51:00Z',
            open: '1.00',
            high: '1.10',
            low: '0.90',
            close: '1.05',
            volume: '12.5',
            quote_volume: '13.1',
            trade_count: 4,
          },
        ],
        meta: { count: 1, next_cursor: 'opaque.cursor/v1', request_id: 'req-spot-candle' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new SpotCandlesClient('test-key', { baseUrl: 'https://api.test' });
    const result = await client.history('HYPE-USDC', {
      start: 1742640622000,
      end: 1742644222000,
      interval: '1m',
      limit: 1000,
      cursor: 'opaque.cursor/v0',
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/v1/hyperliquid/spot/candles/HYPE-USDC');
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      start: '1742640622000',
      end: '1742644222000',
      interval: '1m',
      limit: '1000',
      cursor: 'opaque.cursor/v0',
    });
    expect(result).toEqual({
      data: [
        {
          timestamp: '2025-03-22T10:51:00Z',
          open: '1.00',
          high: '1.10',
          low: '0.90',
          close: '1.05',
          volume: '12.5',
          quoteVolume: '13.1',
          tradeCount: 4,
        },
      ],
      nextCursor: 'opaque.cursor/v1',
    });
  });

  it('allows the Spot candle command and uses the Spot route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeApiResponse({
        success: true,
        data: [],
        meta: { count: 0, request_id: 'req-empty' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    interceptExit();

    await expect(
      spotCandles('HYPE-USDC', {
        start: '2025-03-22T10:50:22Z',
        end: '2025-03-22T11:50:22Z',
        interval: '5m',
        limit: '1000',
        cursor: 'opaque.cursor/v0',
        format: 'json',
        apiKey: 'test-key',
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe(
      '/v1/hyperliquid/spot/candles/HYPE-USDC',
    );
  });

  it('rejects a Spot candle limit above the verified maximum before a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    interceptExit();

    await expect(
      spotCandles('HYPE-USDC', {
        start: '2025-03-22T10:50:22Z',
        end: '2025-03-22T11:50:22Z',
        interval: '1h',
        limit: '1001',
        format: 'json',
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({ code: 2 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('documents the Spot candle route and keeps perp-only resources absent', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const cliSource = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');
    const spotSource = readFileSync(new URL('../src/commands/spot.ts', import.meta.url), 'utf8');

    expect(cliSource).toContain(".command('candles <symbol>')");
    expect(readme).toContain('Spot candles from 2025-03-22T10:50:22Z');
    expect(readme).toContain('oxa spot candles HYPE-USDC');
    expect(`${readme}\n${cliSource}\n${spotSource}`).not.toContain(
      'Spot has no funding, open interest, liquidations, or candles',
    );
    expect(`${readme}\n${cliSource}\n${spotSource}`).toContain('Spot has no funding, open interest, or liquidations');
  });
});
