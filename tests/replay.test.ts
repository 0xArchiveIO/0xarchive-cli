import * as sdk from '@0xarchive/sdk';
import { OxArchiveWs } from '@0xarchive/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureIo, lastError, parseCli, runCli, stdoutText } from './helpers.js';

// `oxa stream replay` runs on the SDK's WebSocket client (OxArchiveWs). The
// global WebSocket is replaced by a stand-in that records frames and lets a
// test play the server's side.
class FakeSdkSocket {
  static OPEN = 1;
  static instances: FakeSdkSocket[] = [];
  readyState = 0;
  readonly sent: string[] = [];
  closeCalls = 0;
  onopen?: () => void;
  onclose?: (event: { code: number; reason: string }) => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;

  constructor(readonly url: string) {
    FakeSdkSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
}

const START = '2026-09-28T00:00:00Z';
const END = '2026-09-28T00:05:00Z';
const START_MS = Date.parse(START);
const END_MS = Date.parse(END);

/** Start a replay, open the socket, and wait for the replay request. */
async function startReplay(...args: string[]): Promise<FakeSdkSocket> {
  const parsed = parseCli('stream', 'replay', ...args);
  await vi.waitFor(() => expect(FakeSdkSocket.instances).toHaveLength(1));
  const ws = FakeSdkSocket.instances[0];
  ws.open();
  await parsed;
  return ws;
}

function frames(ws: FakeSdkSocket): any[] {
  return ws.sent.map((frame) => JSON.parse(frame)).filter((frame) => frame.op !== 'ping');
}

function exitCodes(): number[] {
  return vi.mocked(process.exit).mock.calls.map(([code]) => Number(code ?? 0));
}

// The SDK release the CLI requires exports the channel table the replay
// command follows. On an older install (CI before that release reaches npm)
// the command stops with the SDK floor message instead; see the last block.
const CHANNEL_TABLE = (sdk as unknown as { WS_CHANNEL_CAPABILITIES?: Record<string, { replay: boolean; bulkReplay: boolean }> })
  .WS_CHANNEL_CAPABILITIES;

describe.runIf(CHANNEL_TABLE)('oxa stream replay', () => {
  let savedWsUrl: string | undefined;

  beforeEach(() => {
    FakeSdkSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSdkSocket);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    captureIo();
    vi.spyOn(process, 'on').mockImplementation(() => process);
    vi.stubEnv('OXA_API_KEY', 'test-key');
    savedWsUrl = process.env.OXA_WS_URL;
    delete process.env.OXA_WS_URL;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (savedWsUrl !== undefined) process.env.OXA_WS_URL = savedWsUrl;
  });

  it('sends the replay through the SDK client and writes every message as NDJSON until it completes', async () => {
    const ws = await startReplay('trades', 'BTC', '--start', START, '--end', END, '--speed', '10');
    expect(ws.url).toBe('wss://api.0xarchive.io/ws?apiKey=test-key&version=2026-10-01');
    expect(frames(ws)).toEqual([
      { op: 'replay', channel: 'trades', symbol: 'BTC', start: START_MS, end: END_MS, speed: 10 },
    ]);

    const started = { type: 'replay_started', channel: 'trades', coin: 'BTC', start: START_MS, end: END_MS, speed: 10 };
    const row = { type: 'historical_data', channel: 'trades', coin: 'BTC', timestamp: START_MS + 4, data: { px: '1' } };
    const completed = { type: 'replay_completed', channel: 'trades', coin: 'BTC', snapshots_sent: 1 };
    ws.message(started);
    ws.message({ type: 'pong' });
    ws.message(row);
    expect(process.exit).not.toHaveBeenCalled();
    ws.message(completed);

    expect(stdoutText()).toBe([started, row, completed].map((m) => JSON.stringify(m) + '\n').join(''));
    expect(exitCodes()).toEqual([0]);
    expect(ws.closeCalls).toBe(1);
  });

  it('uses the SDK default speed when --speed is left out', async () => {
    const ws = await startReplay('funding', 'ETH', '--start', START, '--end', END);
    expect(frames(ws)).toEqual([{ op: 'replay', channel: 'funding', symbol: 'ETH', start: START_MS, end: END_MS, speed: 1 }]);
  });

  it('sends --interval on candle channels', async () => {
    const ws = await startReplay('hip3_candles', 'km:US500', '--start', START, '--end', END, '--interval', '4h');
    expect(frames(ws)[0]).toMatchObject({ channel: 'hip3_candles', symbol: 'km:US500', interval: '4h' });
  });

  it('names HIP-4 coins in the form the WebSocket API expects', async () => {
    const ws = await startReplay('hip4_trades', '42', '--start', START, '--end', END);
    expect(frames(ws)[0]).toMatchObject({ channel: 'hip4_trades', symbol: '#42' });
  });

  it('replays Hyperliquid core L4 with the explicit end', async () => {
    const ws = await startReplay('l4_diffs', 'BTC', '--start', START, '--end', END);
    expect(frames(ws)[0]).toMatchObject({ channel: 'l4_diffs', start: START_MS, end: END_MS });
  });

  it('honors --url and OXA_WS_URL', async () => {
    process.env.OXA_WS_URL = 'wss://replay.example/ws';
    let ws = await startReplay('trades', 'BTC', '--start', START, '--end', END);
    expect(ws.url).toBe('wss://replay.example/ws?apiKey=test-key&version=2026-10-01');

    FakeSdkSocket.instances = [];
    ws = await startReplay('trades', 'BTC', '--start', START, '--end', END, '--url', 'wss://other.example/ws');
    expect(ws.url).toBe('wss://other.example/ws?apiKey=test-key&version=2026-10-01');
  });

  it('prints one summary line per message in pretty format', async () => {
    const ws = await startReplay('trades', 'BTC', '--start', START, '--end', END, '--format', 'pretty');
    ws.message({ type: 'historical_data', channel: 'trades', coin: 'BTC', timestamp: START_MS, data: { px: '1' } });
    expect(stdoutText()).toContain(`[trades] historical_data ${START_MS} {"px":"1"}\n`);
  });

  it('prints the error_code of a server error and exits by its class', async () => {
    const ws = await startReplay('trades', 'NOPE', '--start', START, '--end', END);
    ws.message({ type: 'error', message: "The symbol 'NOPE' does not exist.", error_code: 'invalid_symbol' });
    expect(exitCodes()).toEqual([2]);
    expect(lastError()).toEqual({
      error: "replay error: The symbol 'NOPE' does not exist.",
      code: 2,
      type: 'validation',
      error_code: 'invalid_symbol',
    });
  });

  it('exits with a network error on a server error without a code', async () => {
    const ws = await startReplay('trades', 'BTC', '--start', START, '--end', END);
    ws.message({ type: 'error', message: 'Replay failed.' });
    expect(exitCodes()).toEqual([4]);
    expect(lastError()).toEqual({ error: 'replay error: Replay failed.', code: 4, type: 'network' });
  });

  it('exits with a network error on slow_consumer', async () => {
    const ws = await startReplay('l4_diffs', 'BTC', '--start', START, '--end', END);
    ws.message({ type: 'error', message: 'The connection fell behind.', error_code: 'slow_consumer' });
    expect(exitCodes()).toEqual([4]);
    expect(lastError()).toMatchObject({ code: 4, type: 'network', error_code: 'slow_consumer' });
  });

  it('exits with a network error when the server closes before the replay completes', async () => {
    const ws = await startReplay('trades', 'BTC', '--start', START, '--end', END);
    expect(() => ws.serverClose(1011)).toThrow(expect.objectContaining({ code: 4 }));
    expect(lastError().error).toBe('websocket closed before the replay completed (code=1011).');
  });

  it('reports a connection that closes before opening', async () => {
    // The command stops inside the close handler, so its parse never settles.
    void parseCli('stream', 'replay', 'trades', 'BTC', '--start', START, '--end', END);
    await vi.waitFor(() => expect(FakeSdkSocket.instances).toHaveLength(1));
    expect(() => FakeSdkSocket.instances[0].serverClose(1006)).toThrow(expect.objectContaining({ code: 4 }));
    expect(lastError().error).toBe('websocket closed before open (code=1006). Check the URL and your API key.');
  });

  it.each([
    ['spot_trades', 'spot_trades is live only; the API does not replay it. Use `oxa trades history --exchange spot --start ... --end ...` for Spot trade history.'],
    ['ticker', 'ticker is live only; the API does not replay it. Use `oxa summary get` or `oxa prices history` for stored prices.'],
    ['spot_orderbook', 'spot_orderbook is live only; the API does not replay it. Use `oxa orderbook history --exchange spot` for stored Spot books.'],
  ])('refuses the live-only channel %s before opening a socket', async (channel, message) => {
    expect(await runCli('stream', 'replay', channel, 'BTC', '--start', START, '--end', END)).toBe(2);
    expect(lastError()).toEqual({ error: message, code: 2, type: 'validation' });
    expect(FakeSdkSocket.instances).toHaveLength(0);
  });

  it('refuses spot_twap, which is served over REST only, before opening a socket', async () => {
    expect(await runCli('stream', 'replay', 'spot_twap', 'HYPE-USDC', '--start', START, '--end', END)).toBe(2);
    expect(lastError()).toEqual({
      error:
        'spot_twap is served over REST only; the API neither streams nor replays it. ' +
        'Use `oxa spot twap history <symbol> --start ... --end ...` for Spot TWAP history.',
      code: 2,
      type: 'validation',
    });
    expect(FakeSdkSocket.instances).toHaveLength(0);
  });

  it('refuses exactly the channels the SDK table does not mark replayable', async () => {
    const liveOnly = Object.entries(CHANNEL_TABLE!).filter(([, c]) => !c.replay).map(([channel]) => channel);
    expect(liveOnly.sort()).toEqual(['all_tickers', 'spot_orderbook', 'spot_trades', 'spot_twap', 'ticker']);
    for (const channel of liveOnly) {
      expect(await runCli('stream', 'replay', channel, 'BTC', '--start', START, '--end', END)).toBe(2);
    }
    expect(FakeSdkSocket.instances).toHaveLength(0);
  });

  it.each([
    ['orderbook_full', 'BTC', 'BTC'],
    ['hip3_orderbook_full', 'km:US500', 'km:US500'],
    ['hip3_l4_diffs', 'xyz:TSLA', 'xyz:TSLA'],
    ['hip3_l4_orders', 'xyz:TSLA', 'xyz:TSLA'],
    ['hip4_l4_diffs', '42', '#42'],
    ['hip4_l4_orders', '42', '#42'],
    ['spot_l4_diffs', 'HYPE-USDC', 'HYPE-USDC'],
    ['spot_l4_orders', 'HYPE-USDC', 'HYPE-USDC'],
  ])('replays %s in bulk, as the capability table allows', async (channel, symbol, sent) => {
    expect(CHANNEL_TABLE![channel]).toMatchObject({ replay: true, bulkReplay: true });
    const ws = await startReplay(channel, symbol, '--start', START, '--end', END);
    expect(frames(ws)[0]).toMatchObject({ op: 'replay', channel, symbol: sent, start: START_MS, end: END_MS });

    const snapshot = { type: 'l4_snapshot', channel, coin: sent, last_block_number: 7, data: { bids: [[1]], asks: [] } };
    const batch = { type: 'l4_batch', channel, coin: sent, data: [{ seq: 1 }, { seq: 2 }] };
    const completed = { type: 'replay_completed', channel, coin: sent, snapshots_sent: 2 };
    ws.message(snapshot);
    ws.message(batch);
    ws.message(completed);
    expect(stdoutText()).toBe([snapshot, batch, completed].map((m) => JSON.stringify(m) + '\n').join(''));
    expect(exitCodes()).toEqual([0]);
  });

  it('summarizes bulk pages in pretty format instead of printing every event', async () => {
    const ws = await startReplay('hip3_l4_diffs', 'xyz:TSLA', '--start', START, '--end', END, '--format', 'pretty');
    ws.message({ type: 'l4_snapshot', channel: 'hip3_l4_diffs', last_block_number: 9, timestamp: START_MS, data: { bids: [1, 2], asks: [3] } });
    ws.message({ type: 'l4_batch', channel: 'hip3_l4_diffs', data: [{ seq: 1 }, { seq: 2 }, { seq: 3 }] });
    expect(stdoutText()).toContain('bulk (speed ignored)');
    expect(stdoutText()).toContain(`[hip3_l4_diffs] l4_snapshot ${START_MS} block=9 bids=2 asks=1\n`);
    expect(stdoutText()).toContain('[hip3_l4_diffs] l4_batch 3 events\n');
  });

  it.each([
    [['bogus', 'BTC', '--start', START, '--end', END], /^Unknown replay channel "bogus"\. Replayable channels: candles, funding, hip3_candles, /],
    [['trades', 'BTC', '--start', END, '--end', START], /^--start must be before --end$/],
    [['trades', 'BTC', '--start', START, '--end', END, '--speed', '0'], /^--speed must be a positive number/],
    [['trades', 'BTC', '--start', START, '--end', END, '--interval', '1h'], /^--interval applies to candle channels only/],
    [['candles', 'BTC', '--start', START, '--end', END, '--interval', '2h'], /^Invalid interval "2h"/],
  ])('refuses %j before opening a socket', async (args, message) => {
    expect(await runCli('stream', 'replay', ...args)).toBe(2);
    expect(lastError().error).toMatch(message);
    expect(FakeSdkSocket.instances).toHaveLength(0);
  });

  it('asks for Node 22 when there is no global WebSocket', async () => {
    vi.stubGlobal('WebSocket', undefined);
    expect(await runCli('stream', 'replay', 'trades', 'BTC', '--start', START, '--end', END)).toBe(5);
    expect(lastError().error).toMatch(/^WebSocket replay requires Node\.js 22\+/);
  });
});

describe.skipIf(CHANNEL_TABLE)('oxa stream replay on an SDK older than the floor', () => {
  beforeEach(() => {
    FakeSdkSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSdkSocket);
    captureIo();
    vi.stubEnv('OXA_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('asks for the SDK release with the channel table', async () => {
    expect(await runCli('stream', 'replay', 'trades', 'BTC', '--start', START, '--end', END)).toBe(5);
    expect(lastError().error).toMatch(/requires @0xarchive\/sdk 1\.12\.0 or newer/);
    expect(FakeSdkSocket.instances).toHaveLength(0);
  });
});
