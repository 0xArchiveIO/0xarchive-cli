import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HIP4_REPLAY_ONLY_CHANNELS,
  LIGHTER_REPLAY_ONLY_CHANNELS,
  buildSubscribeMessage,
  isLighterDropNotice,
  parseIntervalMs,
  resolveChannel,
  streamGenericCommand,
  streamLiquidationsCommand,
  streamOrderbookCommand,
  streamTradesCommand,
  wsSymbol,
} from '../src/commands/stream.js';

class ProcessExit extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

type Listener = (event: any) => void;

// Minimal stand-in for the global WebSocket: records the URL and every frame
// sent, and lets a test fire server events by hand.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  closeCalls = 0;

  send(data: string): void {
    this.sent.push(data);
  }

  // Like the real socket, close() only starts the close; the test fires the
  // resulting events itself.
  close(): void {
    this.closeCalls += 1;
  }

  fire(type: string, event: any = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  message(payload: unknown): void {
    this.fire('message', { data: JSON.stringify(payload) });
  }
}

function stderrPayloads(): any[] {
  return vi
    .mocked(process.stderr.write)
    .mock.calls.map(([chunk]) => JSON.parse(String(chunk)));
}

function stdoutLines(): string[] {
  return vi
    .mocked(process.stdout.write)
    .mock.calls.map(([chunk]) => String(chunk));
}

async function expectValidationExit(run: () => Promise<void> | unknown, message: string): Promise<void> {
  await expect(Promise.resolve().then(run)).rejects.toMatchObject({ code: 2 });
  expect(stderrPayloads().at(-1)).toEqual({ error: message, code: 2, type: 'validation' });
  expect(FakeWebSocket.instances).toHaveLength(0);
}

const LIGHTER_BOOK = {
  coin: 'BTC',
  time: 1790294171459,
  levels: [
    [{ px: '84368.7', sz: '0.00020', n: 1 }],
    [{ px: '84368.8', sz: '0.05720', n: 1 }],
  ],
};

describe('oxa stream channel resolution', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExit(code ?? 0);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['trades', undefined, 'trades'],
    ['trades', 'hyperliquid', 'trades'],
    ['trades', 'hip3', 'hip3_trades'],
    ['trades', 'lighter', 'lighter_trades'],
    ['trades', 'Lighter', 'lighter_trades'],
    ['trades', 'spot', 'spot_trades'],
    ['trades', 'rh-lighter', 'rh_lighter_trades'],
    ['trades', 'RH-Lighter', 'rh_lighter_trades'],
    ['orderbook', undefined, 'orderbook'],
    ['orderbook', 'hip3', 'hip3_orderbook'],
    ['orderbook', 'lighter', 'lighter_orderbook'],
    ['orderbook', 'rh-lighter', 'rh_lighter_orderbook'],
    ['orderbook', 'spot', 'spot_orderbook'],
    ['liquidations', undefined, 'liquidations'],
    ['liquidations', 'hip3', 'hip3_liquidations'],
  ])('maps `oxa stream %s --exchange %s` to %s', (verb, exchange, channel) => {
    expect(resolveChannel(verb, exchange)).toBe(channel);
  });

  it.each([
    ['trades', 'hip4', 'hyperliquid, hip3, lighter, rh-lighter, spot'],
    ['orderbook', 'rh_lighter', 'hyperliquid, hip3, lighter, rh-lighter, spot'],
    ['orderbook', 'constructor', 'hyperliquid, hip3, lighter, rh-lighter, spot'],
    ['liquidations', 'lighter', 'hyperliquid, hip3'],
    ['liquidations', 'rh-lighter', 'hyperliquid, hip3'],
    ['liquidations', 'toString', 'hyperliquid, hip3'],
  ])('rejects `oxa stream %s --exchange %s` instead of streaming another venue', (verb, exchange, valid) => {
    expect(() => resolveChannel(verb, exchange)).toThrow(ProcessExit);
    expect(stderrPayloads().at(-1)).toEqual({
      error: `Invalid exchange "${exchange}" for \`oxa stream ${verb}\`. Must be one of: ${valid}.`,
      code: 2,
      type: 'validation',
    });
  });
});

describe('lighter_orderbook --interval-ms', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExit(code ?? 0);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is omitted when not passed, so the server default of one book a second applies', () => {
    expect(parseIntervalMs(undefined, 'lighter_orderbook')).toBeUndefined();
    expect(buildSubscribeMessage('lighter_orderbook', 'BTC')).toEqual({
      op: 'subscribe',
      channel: 'lighter_orderbook',
      symbol: 'BTC',
    });
  });

  it.each([
    ['100', 100],
    ['250', 250],
    ['5000', 5000],
  ])('accepts %s', (raw, expected) => {
    expect(parseIntervalMs(raw, 'lighter_orderbook')).toBe(expected);
    expect(buildSubscribeMessage('lighter_orderbook', 'BTC', expected)).toEqual({
      op: 'subscribe',
      channel: 'lighter_orderbook',
      symbol: 'BTC',
      interval_ms: expected,
    });
  });

  it.each(['50', '99', '5001', '250.5', 'abc', ''])('rejects %j', (raw) => {
    expect(() => parseIntervalMs(raw, 'lighter_orderbook')).toThrow(ProcessExit);
    expect(stderrPayloads().at(-1)).toEqual({
      error:
        `--interval-ms must be a whole number between 100 and 5000 for lighter_orderbook (got ${raw}). ` +
        'Leave it out for one book a second.',
      code: 2,
      type: 'validation',
    });
  });

  it.each(['orderbook', 'lighter_trades', 'lighter_funding', 'spot_orderbook', 'rh_lighter_trades', 'rh_lighter_funding'])(
    'is refused on %s',
    (channel) => {
      expect(() => parseIntervalMs('250', channel)).toThrow(ProcessExit);
      expect(stderrPayloads().at(-1)?.error).toMatch(
        /^--interval-ms is only supported on lighter_orderbook and rh_lighter_orderbook/,
      );
    },
  );

  it.each([
    ['100', 100],
    ['5000', 5000],
  ])('accepts %s on rh_lighter_orderbook', (raw, expected) => {
    expect(parseIntervalMs(raw, 'rh_lighter_orderbook')).toBe(expected);
    expect(buildSubscribeMessage('rh_lighter_orderbook', 'AAPL-USDG', expected)).toEqual({
      op: 'subscribe',
      channel: 'rh_lighter_orderbook',
      symbol: 'AAPL-USDG',
      interval_ms: expected,
    });
  });

  it('names the Robinhood Chain book channel in the range error', () => {
    expect(() => parseIntervalMs('99', 'rh_lighter_orderbook')).toThrow(ProcessExit);
    expect(stderrPayloads().at(-1)?.error).toBe(
      '--interval-ms must be a whole number between 100 and 5000 for rh_lighter_orderbook (got 99). ' +
        'Leave it out for one book a second.',
    );
  });
});

describe('Lighter drop notices', () => {
  it('matches a drop notice on any Lighter live channel, on either deployment', () => {
    for (const channel of [
      'lighter_orderbook',
      'lighter_trades',
      'lighter_open_interest',
      'lighter_funding',
      'rh_lighter_orderbook',
      'rh_lighter_trades',
      'rh_lighter_open_interest',
      'rh_lighter_funding',
    ]) {
      expect(isLighterDropNotice(channel, `Dropped ~3 live ${channel} messages for BTC: ...`)).toBe(true);
    }
  });

  it('does not match the stop notice, other errors, or non-Lighter channels', () => {
    expect(
      isLighterDropNotice(
        'lighter_trades',
        'Stopped the lighter_trades stream for BTC: your connection is too slow to keep up. Re-subscribe to resume.',
      ),
    ).toBe(false);
    expect(isLighterDropNotice('lighter_trades', 'Unknown Lighter symbol NOPE.')).toBe(false);
    expect(isLighterDropNotice('trades', 'Dropped ~3 live messages: your connection fell behind.')).toBe(false);
    expect(isLighterDropNotice('l4_diffs', 'Dropped ~3 live messages: your connection fell behind.')).toBe(false);
  });
});

describe('oxa stream over a WebSocket', () => {
  let savedWsUrl: string | undefined;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubEnv('OXA_API_KEY', 'test-key');
    savedWsUrl = process.env.OXA_WS_URL;
    delete process.env.OXA_WS_URL;
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'on').mockImplementation(() => process);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExit(code ?? 0);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (savedWsUrl !== undefined) process.env.OXA_WS_URL = savedWsUrl;
  });

  it('subscribes to lighter_orderbook with interval_ms and writes one JSON record per line', async () => {
    await streamOrderbookCommand('BTC', { exchange: 'lighter', intervalMs: '250', format: 'json' });

    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('wss://api.0xarchive.io/ws?apiKey=test-key');

    ws.fire('open');
    expect(ws.sent.map((frame) => JSON.parse(frame))).toEqual([
      { op: 'subscribe', channel: 'lighter_orderbook', symbol: 'BTC', interval_ms: 250 },
    ]);

    ws.message({ type: 'subscribed', channel: 'lighter_orderbook', coin: 'BTC', symbol: 'BTC' });
    const frame = { type: 'data', channel: 'lighter_orderbook', coin: 'BTC', symbol: 'BTC', data: LIGHTER_BOOK };
    ws.message(frame);
    ws.message(frame);

    const lines = stdoutLines();
    expect(lines).toEqual([JSON.stringify(frame) + '\n', JSON.stringify(frame) + '\n']);
    expect(lines.every((line) => line.indexOf('\n') === line.length - 1)).toBe(true);
  });

  it('subscribes to lighter_trades without an interval', async () => {
    await streamTradesCommand('ETH', { exchange: 'lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    expect(JSON.parse(ws.sent[0])).toEqual({ op: 'subscribe', channel: 'lighter_trades', symbol: 'ETH' });
  });

  it.each([
    'lighter_orderbook',
    'lighter_trades',
    'lighter_open_interest',
    'lighter_funding',
    'rh_lighter_orderbook',
    'rh_lighter_trades',
    'rh_lighter_open_interest',
    'rh_lighter_funding',
  ])(
    'forwards the live Lighter channel %s through `oxa stream subscribe`',
    async (channel) => {
      await streamGenericCommand(channel.toUpperCase(), 'BTC', { format: 'json' });
      const ws = FakeWebSocket.instances[0];
      ws.fire('open');
      expect(JSON.parse(ws.sent[0])).toEqual({ op: 'subscribe', channel, symbol: 'BTC' });
    },
  );

  it('uses the event time in the pretty summary line', async () => {
    await streamGenericCommand('lighter_orderbook', 'BTC', { format: 'pretty' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    ws.message({ type: 'data', channel: 'lighter_orderbook', coin: 'BTC', symbol: 'BTC', data: LIGHTER_BOOK });
    expect(stdoutLines().at(-1)).toBe(`[lighter_orderbook] 1790294171459 ${JSON.stringify(LIGHTER_BOOK)}\n`);
  });

  it('keeps streaming after a Lighter drop notice and reports it on stderr as a warning', async () => {
    await streamTradesCommand('BTC', { exchange: 'lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    const message =
      'Dropped ~12 live lighter_trades messages for BTC: your connection fell behind the Lighter stream, ' +
      'and those trades were not delivered.';
    expect(() => ws.message({ type: 'error', message })).not.toThrow();
    expect(process.exit).not.toHaveBeenCalled();
    expect(stderrPayloads().at(-1)).toEqual({ warning: `stream warning: ${message}`, type: 'lag' });

    const frame = { type: 'data', channel: 'lighter_trades', coin: 'BTC', symbol: 'BTC', data: [] };
    ws.message(frame);
    expect(stdoutLines()).toEqual([JSON.stringify(frame) + '\n']);
  });

  it('exits with a network error when the server stops a lagging Lighter subscription', async () => {
    await streamTradesCommand('BTC', { exchange: 'lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    const message =
      'Stopped the lighter_trades stream for BTC: your connection is too slow to keep up. Re-subscribe to resume.';
    expect(() => ws.message({ type: 'error', message })).toThrow(ProcessExit);
    expect(process.exit).toHaveBeenCalledWith(4);
    expect(stderrPayloads().at(-1)).toEqual({ error: `stream error: ${message}`, code: 4, type: 'network' });
  });

  it('still exits on a drop notice for a non-Lighter channel', async () => {
    await streamGenericCommand('l4_diffs', 'BTC', { format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    const message = 'Dropped ~5 live messages: your connection fell behind the Hyperliquid stream.';
    expect(() => ws.message({ type: 'error', message })).toThrow(ProcessExit);
    expect(process.exit).toHaveBeenCalledWith(4);
    expect(stderrPayloads().at(-1)).toEqual({ error: `stream error: ${message}`, code: 4, type: 'network' });
  });

  it('exits with a network error on any other server error', async () => {
    await streamOrderbookCommand('NOPE', { exchange: 'lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    const message = 'Unknown Lighter symbol NOPE.';
    expect(() => ws.message({ type: 'error', message })).toThrow(ProcessExit);
    expect(stderrPayloads().at(-1)).toEqual({ error: `stream error: ${message}`, code: 4, type: 'network' });
  });

  it('treats its own --duration-ms close as a clean stop even when the server drops the session', async () => {
    vi.useFakeTimers();
    try {
      await streamTradesCommand('BTC', { exchange: 'lighter', durationMs: '1000', format: 'json' });
      const ws = FakeWebSocket.instances[0];
      ws.fire('open');
      vi.advanceTimersByTime(999);
      expect(ws.closeCalls).toBe(0);
      vi.advanceTimersByTime(1);
      expect(ws.closeCalls).toBe(1);

      // What Node reports when the server ends the session without a close
      // handshake: an error event, then a 1006 close.
      ws.fire('error', { message: '' });
      expect(() => ws.fire('close', { code: 1006, wasClean: false })).toThrow(
        expect.objectContaining({ code: 0 }),
      );
      expect(process.stderr.write).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a Ctrl-C close as a clean stop', async () => {
    await streamOrderbookCommand('BTC', { exchange: 'lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    const sigint = vi.mocked(process.on).mock.calls.find(([signal]) => signal === 'SIGINT')?.[1] as () => void;
    expect(sigint).toBeTypeOf('function');
    sigint();
    expect(ws.closeCalls).toBe(1);
    ws.fire('error', { message: '' });
    expect(() => ws.fire('close', { code: 1006, wasClean: false })).toThrow(expect.objectContaining({ code: 0 }));
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it('still exits with a network error when the connection fails on its own', async () => {
    await streamTradesCommand('BTC', { exchange: 'lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    expect(() => ws.fire('error', { message: 'socket hang up' })).toThrow(expect.objectContaining({ code: 4 }));
    expect(stderrPayloads().at(-1)).toEqual({ error: 'websocket error: socket hang up', code: 4, type: 'network' });
  });

  it.each(Object.keys(LIGHTER_REPLAY_ONLY_CHANNELS))(
    'rejects the replay-only channel %s before opening a socket',
    async (channel) => {
      await expectValidationExit(
        () => streamGenericCommand(channel, 'BTC', { format: 'json' }),
        `${channel} supports historical replay only; live subscriptions are not available on this channel. ` +
          LIGHTER_REPLAY_ONLY_CHANNELS[channel],
      );
    },
  );

  it('rejects --interval-ms on a non-Lighter orderbook before opening a socket', async () => {
    await expectValidationExit(
      () => streamOrderbookCommand('BTC', { intervalMs: '250', format: 'json' }),
      '--interval-ms is only supported on lighter_orderbook and rh_lighter_orderbook ' +
        '(`oxa stream orderbook <symbol> --exchange lighter|rh-lighter` or ' +
        '`oxa stream subscribe lighter_orderbook|rh_lighter_orderbook <symbol>`).',
    );
  });

  it('rejects an out-of-range --interval-ms before opening a socket', async () => {
    await expectValidationExit(
      () => streamGenericCommand('lighter_orderbook', 'BTC', { intervalMs: '50', format: 'json' }),
      '--interval-ms must be a whole number between 100 and 5000 for lighter_orderbook (got 50). ' +
        'Leave it out for one book a second.',
    );
  });

  it('rejects live liquidations for Lighter before opening a socket', async () => {
    await expectValidationExit(
      () => streamLiquidationsCommand('BTC', { exchange: 'lighter', format: 'json' }),
      'Invalid exchange "lighter" for `oxa stream liquidations`. Must be one of: hyperliquid, hip3.',
    );
  });

  it.each(['constructor', '__proto__', 'hasOwnProperty'])(
    'treats the object-builtin name %s as an unknown channel',
    async (channel) => {
      await expect(
        Promise.resolve().then(() => streamGenericCommand(channel, 'BTC', { format: 'json' })),
      ).rejects.toMatchObject({ code: 2 });
      expect(stderrPayloads().at(-1)?.error).toMatch(new RegExp(`^Unknown stream channel "${channel}"`));
      expect(FakeWebSocket.instances).toHaveLength(0);
    },
  );

  it('treats a Ctrl-C before the socket opens as a clean stop', async () => {
    await streamTradesCommand('BTC', { exchange: 'lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    const sigint = vi.mocked(process.on).mock.calls.find(([signal]) => signal === 'SIGINT')?.[1] as () => void;
    sigint();
    ws.fire('error', { message: '' });
    expect(() => ws.fire('close', { code: 1006, wasClean: false })).toThrow(expect.objectContaining({ code: 0 }));
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it('reports a connection that closes before opening on its own', async () => {
    await streamTradesCommand('BTC', { exchange: 'lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    expect(() => ws.fire('close', { code: 1006, wasClean: false })).toThrow(expect.objectContaining({ code: 4 }));
    expect(stderrPayloads().at(-1)?.error).toBe(
      'websocket closed before open (code=1006). Check the URL and your API key.',
    );
  });

  it('subscribes to rh_lighter_orderbook with interval_ms on the default endpoint', async () => {
    await streamOrderbookCommand('AAPL-USDG', { exchange: 'rh-lighter', intervalMs: '500', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('wss://api.0xarchive.io/ws?apiKey=test-key');
    ws.fire('open');
    expect(ws.sent.map((frame) => JSON.parse(frame))).toEqual([
      { op: 'subscribe', channel: 'rh_lighter_orderbook', symbol: 'AAPL-USDG', interval_ms: 500 },
    ]);
    const frame = { type: 'data', channel: 'rh_lighter_orderbook', coin: 'BTC', symbol: 'BTC', data: LIGHTER_BOOK };
    ws.message(frame);
    expect(stdoutLines()).toEqual([JSON.stringify(frame) + '\n']);
  });

  it('subscribes to rh_lighter_trades without an interval', async () => {
    await streamTradesCommand('BTC', { exchange: 'rh-lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    expect(JSON.parse(ws.sent[0])).toEqual({ op: 'subscribe', channel: 'rh_lighter_trades', symbol: 'BTC' });
  });

  it('keeps streaming after a Robinhood Chain drop notice', async () => {
    await streamTradesCommand('BTC', { exchange: 'rh-lighter', format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    const message =
      'Dropped ~4 live rh_lighter_trades messages for BTC: your connection fell behind the Lighter (Robinhood Chain) ' +
      'stream, and those trades were not delivered.';
    expect(() => ws.message({ type: 'error', message })).not.toThrow();
    expect(process.exit).not.toHaveBeenCalled();
    expect(stderrPayloads().at(-1)).toEqual({ warning: `stream warning: ${message}`, type: 'lag' });
  });

  it('rejects live liquidations for Lighter on Robinhood Chain before opening a socket', async () => {
    await expectValidationExit(
      () => streamLiquidationsCommand('BTC', { exchange: 'rh-lighter', format: 'json' }),
      'Invalid exchange "rh-lighter" for `oxa stream liquidations`. Must be one of: hyperliquid, hip3.',
    );
  });

  it.each([
    ['orderbook_full', 'BTC'],
    ['hip3_orderbook_full', 'km:US500'],
    ['hip4_trades', '#0'],
    ['hip4_l4_diffs', '#0'],
    ['hip4_l4_orders', '#0'],
  ])('forwards the live channel %s through `oxa stream subscribe`', async (channel, symbol) => {
    await streamGenericCommand(channel, symbol, { format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    expect(JSON.parse(ws.sent[0])).toEqual({ op: 'subscribe', channel, symbol });
  });

  it('passes the full-depth snapshot and batches through as NDJSON', async () => {
    await streamGenericCommand('orderbook_full', 'BTC', { format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    const snapshot = {
      type: 'l4_snapshot',
      channel: 'orderbook_full',
      coin: 'BTC',
      symbol: 'BTC',
      data: { bid_count: 1, ask_count: 1, bids: [{ px: 1, sz: 2, n: 1 }], asks: [{ px: 3, sz: 4, n: 1 }] },
    };
    const batch = { type: 'l4_batch', channel: 'orderbook_full', coin: 'BTC', symbol: 'BTC', data: [{ px: 1, sz: 0 }] };
    ws.message(snapshot);
    ws.message(batch);
    expect(stdoutLines()).toEqual([JSON.stringify(snapshot) + '\n', JSON.stringify(batch) + '\n']);
  });

  it.each(['0', '%230', '#0'])('subscribes to HIP-4 coin %s as #0', async (symbol) => {
    await streamGenericCommand('hip4_trades', symbol, { format: 'json' });
    const ws = FakeWebSocket.instances[0];
    ws.fire('open');
    expect(JSON.parse(ws.sent[0])).toEqual({ op: 'subscribe', channel: 'hip4_trades', symbol: '#0' });
  });

  it.each(Object.keys(HIP4_REPLAY_ONLY_CHANNELS))(
    'rejects the stored-only channel %s before opening a socket',
    async (channel) => {
      await expectValidationExit(
        () => streamGenericCommand(channel, '0', { format: 'json' }),
        `${channel} is served from stored data only; live subscriptions are not available on this channel. ` +
          HIP4_REPLAY_ONLY_CHANNELS[channel],
      );
    },
  );
});

describe('WebSocket symbols', () => {
  it('uses the #<n> form on HIP-4 channels only', () => {
    expect(wsSymbol('hip4_l4_diffs', '42')).toBe('#42');
    expect(wsSymbol('hip4_trades', ' %2342 ')).toBe('#42');
    expect(wsSymbol('hip4_trades', 'not-a-coin')).toBe('not-a-coin');
    expect(wsSymbol('trades', '42')).toBe('42');
    expect(wsSymbol('hip3_trades', 'km:US500')).toBe('km:US500');
  });
});
