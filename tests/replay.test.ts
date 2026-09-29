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

/** What the installed SDK says when asked to replay `channel`, or undefined. */
function sdkRefusal(channel: string): string | undefined {
  try {
    (new OxArchiveWs({ apiKey: 'x' }).replay as any)(channel, 'BTC', { start: 1, end: 2 });
  } catch (error) {
    return (error as Error).message;
  }
  return undefined;
}

describe('oxa stream replay', () => {
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
    expect(ws.url).toBe('wss://api.0xarchive.io/ws?apiKey=test-key');
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
    expect(ws.url).toBe('wss://replay.example/ws?apiKey=test-key');

    FakeSdkSocket.instances = [];
    ws = await startReplay('trades', 'BTC', '--start', START, '--end', END, '--url', 'wss://other.example/ws');
    expect(ws.url).toBe('wss://other.example/ws?apiKey=test-key');
  });

  it('prints one summary line per message in pretty format', async () => {
    const ws = await startReplay('trades', 'BTC', '--start', START, '--end', END, '--format', 'pretty');
    ws.message({ type: 'historical_data', channel: 'trades', coin: 'BTC', timestamp: START_MS, data: { px: '1' } });
    expect(stdoutText()).toContain(`[trades] historical_data ${START_MS} {"px":"1"}\n`);
  });

  it('exits with a network error on a server error', async () => {
    const ws = await startReplay('trades', 'NOPE', '--start', START, '--end', END);
    ws.message({ type: 'error', message: "The symbol 'NOPE' does not exist." });
    expect(exitCodes()).toEqual([4]);
    expect(lastError()).toEqual({
      error: "replay error: The symbol 'NOPE' does not exist.",
      code: 4,
      type: 'network',
    });
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
    ['spot_trades', 'spot_trades is live-only; replay is unavailable. Use `oxa spot trades <symbol> --start ... --end ...` for Spot trade history.'],
    ['ticker', 'ticker is live-only; replay is unavailable. Use `oxa summary` or `oxa prices` for stored prices.'],
  ])('refuses the live-only channel %s before opening a socket', async (channel, message) => {
    expect(await runCli('stream', 'replay', channel, 'BTC', '--start', START, '--end', END)).toBe(2);
    expect(lastError()).toEqual({ error: message, code: 2, type: 'validation' });
    expect(FakeSdkSocket.instances).toHaveLength(0);
  });

  it.each([
    ['orderbook_full', 'In the CLI: `oxa l2 history` and `oxa l2 diffs`.'],
    ['hip3_orderbook_full', 'In the CLI: `oxa l2 history --exchange hip3` and `oxa l2 diffs --exchange hip3`.'],
    ['hip3_l4_diffs', 'In the CLI: `oxa l4 diffs --exchange hip3`.'],
    ['hip4_l4_orders', 'In the CLI: `oxa hip4 orders history <coin>`.'],
    ['spot_l4_diffs', 'In the CLI: `oxa spot l4 <symbol> --timestamp <ms>` for the book at a point in time.'],
  ])('refuses %s with the SDK error before opening a socket', async (channel, hint) => {
    const refusal = sdkRefusal(channel);
    expect(await runCli('stream', 'replay', channel, 'BTC', '--start', START, '--end', END)).toBe(2);
    const expected = refusal ? `${refusal} ${hint}` : `${channel} is live-only; replay is unavailable. ${hint}`;
    expect(lastError()).toEqual({ error: expected, code: 2, type: 'validation' });
    expect(FakeSdkSocket.instances).toHaveLength(0);
  });

  it.each([
    [['bogus', 'BTC', '--start', START, '--end', END], /^Unknown replay channel "bogus"\. Replayable channels: candles, /],
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
