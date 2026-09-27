import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ordersFlowCommand } from '../src/commands/orders.js';
import { hip4OrdersFlow } from '../src/commands/hip4.js';

function fakeApiResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

const page = (nextCursor?: string) =>
  fakeApiResponse({
    success: true,
    data: [{ timestamp: '2026-07-13T16:39:00Z', limit_orders_placed: 3 }],
    meta: { count: 1, request_id: 'order-flow', ...(nextCursor ? { next_cursor: nextCursor } : {}) },
  });

describe('order flow paging', () => {
  let stdout: string[];

  beforeEach(() => {
    stdout = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      stdout.push(String(chunk));
      return true;
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const window = {
    start: '1783900800000',
    end: '1783987200000',
    interval: '1m',
    format: 'json',
    apiKey: 'test-key',
  };

  it('sends --cursor and prints the next cursor on the core and HIP-4 commands', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(page('1783960740000')).mockResolvedValue(page());
    vi.stubGlobal('fetch', fetchMock);

    await ordersFlowCommand({ ...window, exchange: 'hyperliquid', symbol: 'BTC' });
    expect(JSON.parse(stdout.join('')).nextCursor).toBe('1783960740000');

    stdout = [];
    await ordersFlowCommand({ ...window, exchange: 'hyperliquid', symbol: 'BTC', cursor: '1783960740000' });
    expect(JSON.parse(stdout.join('')).nextCursor).toBeNull();

    await hip4OrdersFlow('0', { ...window, cursor: '1783960740000' });

    const sent = fetchMock.mock.calls.map((call) => new URL(String(call[0])));
    expect(sent.map((url) => url.pathname)).toEqual([
      '/v1/hyperliquid/orders/BTC/flow',
      '/v1/hyperliquid/orders/BTC/flow',
      '/v1/hyperliquid/hip4/orders/0/flow',
    ]);
    expect(sent[0].searchParams.has('cursor')).toBe(false);
    for (const url of sent.slice(1)) {
      expect(url.searchParams.get('cursor')).toBe('1783960740000');
      expect(url.searchParams.get('start')).toBe('1783900800000');
      expect(url.searchParams.get('end')).toBe('1783987200000');
      expect(url.searchParams.get('interval')).toBe('1m');
    }
  });
});
