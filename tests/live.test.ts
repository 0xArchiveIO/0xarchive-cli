/**
 * Read-only checks of the CLI against the live API contract.
 *
 * Skipped unless OXA_LIVE_API_KEY is set (a separate variable from
 * OXA_API_KEY, so a key exported for everyday use never sends test traffic):
 *   OXA_LIVE_API_KEY=0xa_... npx vitest run tests/live.test.ts
 * Optional: OXA_BASE_URL and OXA_WS_URL. The WebSocket check needs Node 22+.
 */
import * as sdk from '@0xarchive/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureIo, lastError, parseCli, runCli, stdoutJson, stdoutText } from './helpers.js';

const liveKey = process.env.OXA_LIVE_API_KEY;
const HOUR = 3_600_000;
const CHANNEL_TABLE = (sdk as unknown as { WS_CHANNEL_CAPABILITIES?: Record<string, { live: boolean; replay: boolean }> })
  .WS_CHANNEL_CAPABILITIES;

/** A ten-minute window that ended two hours ago, as ISO strings. */
function recentWindow(): [string, string] {
  const end = Math.floor((Date.now() - 2 * HOUR) / 60_000) * 60_000;
  return [new Date(end - 10 * 60_000).toISOString(), new Date(end).toISOString()];
}

async function sides(...args: string[]): Promise<Set<string>> {
  expect(await runCli(...args, '--limit', '50')).toBe(0);
  const rows = stdoutJson().data as Array<{ side: string }>;
  return new Set(rows.map((row) => row.side));
}

describe.skipIf(!liveKey)('live API contract', () => {
  beforeEach(() => {
    captureIo();
    vi.stubEnv('OXA_API_KEY', liveKey!);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('lists capabilities, and they agree with the SDK channel table', async () => {
    expect(await runCli('capabilities')).toBe(0);
    const rows = stdoutJson() as Array<{ venue: string; datatype: string; wsChannels: string[]; live: boolean; replay: boolean }>;
    expect(rows.find((r) => r.venue === 'hip3' && r.datatype === 'l4_diffs')).toMatchObject({ replay: true });
    if (CHANNEL_TABLE) {
      for (const row of rows) {
        for (const channel of row.wsChannels) {
          expect({ channel, live: CHANNEL_TABLE[channel]?.live, replay: CHANNEL_TABLE[channel]?.replay }).toEqual({
            channel,
            live: row.live,
            replay: row.replay,
          });
        }
      }
    }
  }, 30_000);

  it('prints error_code and request_id for an unknown symbol, and exits 2', async () => {
    const [start, end] = recentWindow();
    expect(
      await runCli('trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'NOTACOIN', '--start', start, '--end', end),
    ).toBe(2);
    expect(lastError()).toMatchObject({ type: 'validation', error_code: 'invalid_symbol', status: 400, param: 'symbol' });
    expect(lastError().request_id).toBeTruthy();

    expect(await runCli('hip4', 'summary', 'NOTACOIN')).toBe(2);
    expect(lastError()).toMatchObject({ error_code: 'invalid_symbol' });
  }, 30_000);

  it('reports has_more and pages with the cursor', async () => {
    const [start, end] = recentWindow();
    const args = ['trades', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', start, '--end', end, '--limit', '5'];
    expect(await runCli(...args)).toBe(0);
    const first = stdoutJson();
    expect(first.has_more).toBe(true);
    expect(typeof first.nextCursor).toBe('string');

    vi.mocked(process.stdout.write).mockClear();
    expect(await runCli(...args, '--cursor', first.nextCursor)).toBe(0);
    const second = stdoutJson();
    expect(typeof second.has_more).toBe('boolean');
    expect(second.data[0]).not.toEqual(first.data[0]);
  }, 30_000);

  it.each([
    ['hyperliquid', 'BTC'],
    ['hip3', 'xyz:TSLA'],
    ['spot', 'HYPE-USDC'],
  ])('filters %s trade history by --side', async (exchange, symbol) => {
    const [start, end] = recentWindow();
    const range = ['--start', start, '--end', end];
    expect(await sides('trades', 'history', '--exchange', exchange, '--symbol', symbol, ...range, '--side', 'buy')).toEqual(new Set(['B']));
    vi.mocked(process.stdout.write).mockClear();
    expect(await sides('trades', 'history', '--exchange', exchange, '--symbol', symbol, ...range, '--side', 'sell')).toEqual(new Set(['A']));
  }, 30_000);

  it('filters recent trades by --side (HIP-3)', async () => {
    const seen = await sides('trades', 'history', '--exchange', 'hip3', '--symbol', 'xyz:TSLA', '--side', 'sell');
    expect([...seen].every((side) => side === 'A')).toBe(true);
  }, 30_000);

  // Expected to fail: the API does not apply `side` on Lighter and Lighter on
  // Robinhood Chain trades yet and answers 500 (internal_error). The CLI keeps
  // --side on these venues; turn these back into plain `it` once the API
  // filters them (vitest then reports these as unexpectedly passing).
  it.fails.each(['lighter', 'rh-lighter'])('filters %s trade history by --side', async (exchange) => {
    const end = Date.now() - 2 * 24 * HOUR;
    const range = ['--start', new Date(end - HOUR).toISOString(), '--end', new Date(end).toISOString()];
    const seen = await sides('trades', 'history', '--exchange', exchange, '--symbol', 'BTC', ...range, '--side', 'buy');
    expect([...seen].every((side) => side === 'B')).toBe(true);
  }, 30_000);

  it('keeps only trigger events with --triggered true', async () => {
    const [start, end] = recentWindow();
    expect(
      await runCli(
        'orders', 'history', '--exchange', 'hyperliquid', '--symbol', 'BTC', '--start', start, '--end', end,
        '--limit', '50', '--triggered', 'true',
      ),
    ).toBe(0);
    const rows = stdoutJson().data as Array<{ isTrigger?: boolean; status?: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.isTrigger === true)).toBe(true);
  }, 30_000);

  it.each([
    ['l2', 'hyperliquid', 'BTC'],
    ['l2', 'hip3', 'xyz:TSLA'],
    ['orderbook', 'hip3', 'xyz:TSLA'],
    ['orderbook', 'spot', 'HYPE-USDC'],
  ])('caps %s history on %s with --depth', async (group, exchange, symbol) => {
    const [start, end] = recentWindow();
    expect(
      await runCli(group, 'history', '--exchange', exchange, '--symbol', symbol, '--start', start, '--end', end, '--limit', '2', '--depth', '3'),
    ).toBe(0);
    const rows = stdoutJson().data as Array<{ bids: unknown[]; asks: unknown[] }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.bids.length).toBeLessThanOrEqual(3);
      expect(row.asks.length).toBeLessThanOrEqual(3);
    }
  }, 30_000);

  it('answers the old and the conforming forms alike', async () => {
    expect(await runCli('instruments', '--exchange', 'hip3')).toBe(0);
    const old = stdoutJson();
    vi.mocked(process.stdout.write).mockClear();
    expect(await runCli('instruments', 'list', '--exchange', 'hip3')).toBe(0);
    expect(stdoutJson().length).toBe(old.length);
  }, 30_000);

  it.runIf(typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function' && CHANNEL_TABLE)(
    'replays HIP-3 L4 in bulk over the WebSocket',
    async () => {
      vi.spyOn(process, 'on').mockImplementation(() => process);
      const start = Date.now() - 2 * HOUR;
      await parseCli(
        'stream', 'replay', 'hip3_l4_diffs', 'xyz:TSLA',
        '--start', new Date(start).toISOString(), '--end', new Date(start + 30_000).toISOString(),
      );
      await vi.waitFor(() => expect(process.exit).toHaveBeenCalled(), { timeout: 45_000, interval: 250 });
      expect(vi.mocked(process.exit).mock.calls[0][0]).toBe(0);
      const types = stdoutText()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).type);
      expect(types[0]).toBe('replay_started');
      expect(types).toContain('l4_snapshot');
      expect(types.at(-1)).toBe('replay_completed');
    },
    60_000,
  );
});
