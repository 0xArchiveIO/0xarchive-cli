import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The SDK release these commands call (positions, rhLighter, Lighter
// liquidations) is stubbed here, so the suite checks exactly which SDK method
// each command calls, with which arguments, and what it prints.
const sdk = vi.hoisted(() => {
  const positionsResource = () => ({
    get: vi.fn(),
    history: vi.fn(),
    changes: vi.fn(),
    market: vi.fn(),
    marketSummary: vi.fn(),
    all: vi.fn(),
    account: vi.fn(),
    accountHistory: vi.fn(),
  });
  const lighterVenue = () => ({
    positions: positionsResource(),
    liquidations: { history: vi.fn(), volume: vi.fn() },
    trades: { list: vi.fn(), recent: vi.fn() },
  });
  const fresh = () => ({
    hyperliquid: {
      positions: positionsResource(),
      liquidations: { history: vi.fn(), volume: vi.fn(), byUser: vi.fn() },
      trades: { list: vi.fn(), recent: vi.fn() },
      hip3: { positions: positionsResource() },
    },
    lighter: { ...lighterVenue(), accounts: { byL1: vi.fn() } } as Record<string, any>,
    rhLighter: lighterVenue() as Record<string, any> | undefined,
  });
  const state = { clients: fresh(), apiKeys: [] as string[] };
  return {
    state,
    reset() {
      state.clients = fresh();
      state.apiKeys = [];
    },
  };
});

vi.mock('@0xarchive/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@0xarchive/sdk')>();
  class OxArchive {
    constructor(options: { apiKey: string }) {
      sdk.state.apiKeys.push(options.apiKey);
    }
    get hyperliquid() {
      return sdk.state.clients.hyperliquid;
    }
    get lighter() {
      return sdk.state.clients.lighter;
    }
    get rhLighter() {
      return sdk.state.clients.rhLighter;
    }
  }
  return { ...actual, OxArchive };
});

import {
  accountGetCommand,
  accountHistoryCommand,
  accountsByL1Command,
  positionsAllCommand,
  positionsChangesCommand,
  positionsGetCommand,
  positionsHistoryCommand,
  positionsMarketCommand,
  positionsSummaryCommand,
} from '../src/commands/positions.js';
import { liquidationsCommand, liquidationsVolumeCommand, liquidationsUserCommand } from '../src/commands/liquidations.js';
import { tradesFetchCommand } from '../src/commands/trades.js';
import { ordersHistoryCommand } from '../src/commands/orders.js';
import { l4GetCommand } from '../src/commands/l4.js';
import { l2GetCommand } from '../src/commands/l2.js';
import { validateExchange } from '../src/lib/client.js';
import { toEnvelope } from '../src/lib/positions.js';

class ProcessExit extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

const WALLET = '0x1111111111111111111111111111111111111111';
const HOUR = Date.parse('2026-09-01T12:00:00Z');
const START = '2026-09-01T00:00:00Z';
const END = '2026-09-02T00:00:00Z';

function stdoutJson(): any {
  const calls = vi.mocked(process.stdout.write).mock.calls;
  return JSON.parse(String(calls.at(-1)?.[0]));
}

function stdoutText(): string {
  return vi
    .mocked(process.stdout.write)
    .mock.calls.map(([chunk]) => String(chunk))
    .join('');
}

function lastError(): any {
  const calls = vi.mocked(process.stderr.write).mock.calls;
  return JSON.parse(String(calls.at(-1)?.[0]));
}

async function expectExit(run: () => Promise<void>, code: number, message: string | RegExp): Promise<void> {
  await expect(run()).rejects.toMatchObject({ code });
  const error = lastError().error;
  if (typeof message === 'string') expect(error).toBe(message);
  else expect(error).toMatch(message);
}

const WALLET_PAGE = {
  data: {
    positions: [
      {
        symbol: 'BTC',
        coin: 'BTC',
        size: '0.5',
        side: 'long',
        entryPrice: '60000.0',
        markPrice: '61000.0',
        positionValue: '30500.0',
        unrealizedPnl: '500.0',
        liquidationPrice: '41000.0',
        quality: 'complete',
      },
    ],
    account: { accountValue: '10000.0', nPositions: 1, quality: 'complete' },
    accountSeen: 'flat',
  },
  nextCursor: undefined,
  meta: { asOf: '2026-09-01T12:05:00.000Z', source: 'snapshot', quality: 'complete', stale: false },
};

describe('oxa positions', () => {
  beforeEach(() => {
    sdk.reset();
    vi.stubEnv('OXA_API_KEY', 'test-key');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      if ((code ?? 0) === 0) return undefined as never;
      throw new ProcessExit(code ?? 0);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('gets current Hyperliquid positions by wallet and prints data, cursor, and meta', async () => {
    const get = sdk.state.clients.hyperliquid.positions.get;
    get.mockResolvedValue(WALLET_PAGE);

    await positionsGetCommand({ exchange: 'hyperliquid', address: WALLET, format: 'json' });

    expect(get).toHaveBeenCalledWith(WALLET, {});
    expect(stdoutJson()).toEqual({ data: WALLET_PAGE.data, nextCursor: null, has_more: false, meta: WALLET_PAGE.meta });
    expect(sdk.state.apiKeys).toEqual(['test-key']);
  });

  it('passes an as-of timestamp, a symbol filter, and paging', async () => {
    const get = sdk.state.clients.hyperliquid.positions.get;
    get.mockResolvedValue(WALLET_PAGE);

    await positionsGetCommand({
      exchange: 'hyperliquid',
      address: WALLET,
      timestamp: '2026-08-01T00:00:00Z',
      symbol: 'BTC',
      limit: '5',
      cursor: 'abc',
      format: 'json',
    });

    expect(get).toHaveBeenCalledWith(WALLET, {
      timestamp: Date.parse('2026-08-01T00:00:00Z'),
      symbol: 'BTC',
      cursor: 'abc',
      limit: 5,
    });
  });

  it('routes HIP-3 to the hip3 resource with a dex filter', async () => {
    const get = sdk.state.clients.hyperliquid.hip3.positions.get;
    get.mockResolvedValue(WALLET_PAGE);

    await positionsGetCommand({ exchange: 'hip3', address: WALLET, dex: 'xyz', format: 'json' });

    expect(get).toHaveBeenCalledWith(WALLET, { dex: 'xyz' });
    expect(sdk.state.clients.hyperliquid.positions.get).not.toHaveBeenCalled();
  });

  it.each([
    ['lighter', () => sdk.state.clients.lighter.positions.get],
    ['rh-lighter', () => sdk.state.clients.rhLighter!.positions.get],
  ])('keys %s positions by integer account index', async (exchange, method) => {
    method().mockResolvedValue({ data: { positions: [], account: null }, meta: { source: 'snapshot' } });

    await positionsGetCommand({ exchange, account: '281474976710654', format: 'json' });

    expect(method()).toHaveBeenCalledWith(281474976710654, {});
    expect(stdoutJson()).toEqual({
      data: { positions: [], account: null },
      nextCursor: null,
      has_more: false,
      meta: { source: 'snapshot' },
    });
  });

  it('renders a pretty table with the snapshot fields', async () => {
    sdk.state.clients.hyperliquid.positions.get.mockResolvedValue(WALLET_PAGE);

    await positionsGetCommand({ exchange: 'hyperliquid', address: WALLET, format: 'pretty' });

    const out = stdoutText();
    expect(out).toContain('Positions for 0x1111...1111 (Hyperliquid): 1 open');
    expect(out).toContain('snapshot');
    expect(out).toContain('41000.0');
    expect(out).toContain('Account seen');
  });

  it('gets hourly history on Lighter on Robinhood Chain with range, symbol, cursor, and limit', async () => {
    const history = sdk.state.clients.rhLighter!.positions.history;
    history.mockResolvedValue({ data: [{ symbol: 'AAPL-USDG' }], nextCursor: 'c2', meta: { finalizedThrough: 'x' } });

    await positionsHistoryCommand({
      exchange: 'rh-lighter',
      account: '42',
      start: START,
      end: END,
      symbol: 'AAPL-USDG',
      cursor: 'c1',
      limit: '100',
      format: 'json',
    });

    expect(history).toHaveBeenCalledWith(42, {
      start: Date.parse(START),
      end: Date.parse(END),
      symbol: 'AAPL-USDG',
      cursor: 'c1',
      limit: 100,
    });
    expect(stdoutJson()).toEqual({
      data: [{ symbol: 'AAPL-USDG' }],
      nextCursor: 'c2',
      has_more: true,
      meta: { finalizedThrough: 'x' },
    });
  });

  it('gets the change log on HIP-3', async () => {
    const changes = sdk.state.clients.hyperliquid.hip3.positions.changes;
    changes.mockResolvedValue({ data: [], nextCursor: undefined });

    await positionsChangesCommand({ exchange: 'hip3', address: WALLET, start: START, end: END, format: 'json' });

    expect(changes).toHaveBeenCalledWith(WALLET, { start: Date.parse(START), end: Date.parse(END) });
    expect(stdoutJson()).toEqual({ data: [], nextCursor: null, has_more: false });
  });

  it('lists one market with every filter on Lighter', async () => {
    const market = sdk.state.clients.lighter.positions.market;
    market.mockResolvedValue({
      data: [{ accountIndex: '7', side: 'long', size: '1.0', positionValue: '100.0' }],
      nextCursor: 'next',
      meta: { snapshotTs: '2026-09-01T12:00:00Z', totals: { longCount: 1, shortCount: 0 } },
    });

    await positionsMarketCommand({
      exchange: 'lighter',
      symbol: 'ETH',
      hour: '2026-09-01T12:00:00Z',
      side: 'LONG',
      minValue: '1000',
      includeSystem: true,
      limit: '50',
      format: 'json',
    });

    expect(market).toHaveBeenCalledWith('ETH', {
      hour: HOUR,
      side: 'long',
      minValue: 1000,
      includeSystem: true,
      limit: 50,
    });
    expect(stdoutJson().meta.totals).toEqual({ longCount: 1, shortCount: 0 });
  });

  it('summarizes a market now, or as an hourly series', async () => {
    const summary = sdk.state.clients.hyperliquid.positions.marketSummary;
    summary.mockResolvedValue({ data: [{ longCount: 3 }] });

    await positionsSummaryCommand({ exchange: 'hyperliquid', symbol: 'BTC', format: 'json' });
    expect(summary).toHaveBeenLastCalledWith('BTC', {});

    await positionsSummaryCommand({ exchange: 'hyperliquid', symbol: 'BTC', start: START, end: END, format: 'json' });
    expect(summary).toHaveBeenLastCalledWith('BTC', { start: Date.parse(START), end: Date.parse(END) });
  });

  it('pages a Lighter summary series with system accounts included', async () => {
    const summary = sdk.state.clients.lighter.positions.marketSummary;
    summary.mockResolvedValue({ data: [], nextCursor: 'p2' });

    await positionsSummaryCommand({
      exchange: 'lighter',
      symbol: 'ETH',
      start: START,
      end: END,
      includeSystem: true,
      limit: '48',
      cursor: 'p1',
      format: 'json',
    });

    expect(summary).toHaveBeenCalledWith('ETH', {
      start: Date.parse(START),
      end: Date.parse(END),
      includeSystem: true,
      cursor: 'p1',
      limit: 48,
    });
    expect(stdoutJson()).toEqual({ data: [], nextCursor: 'p2', has_more: true });
  });

  it('pages every open position at one hour', async () => {
    const all = sdk.state.clients.rhLighter!.positions.all;
    all.mockResolvedValue({ data: [], nextCursor: 'more' });

    await positionsAllCommand({
      exchange: 'rh-lighter',
      hour: String(HOUR),
      includeSystem: true,
      limit: '2000',
      format: 'json',
    });

    expect(all).toHaveBeenCalledWith({ hour: HOUR, includeSystem: true, limit: 2000 });
    expect(stdoutJson()).toEqual({ data: [], nextCursor: 'more', has_more: true });
  });

  it('gets account summaries and account history on HIP-3', async () => {
    const { account, accountHistory } = sdk.state.clients.hyperliquid.hip3.positions;
    account.mockResolvedValue({ data: [{ dex: 'xyz', accountValue: '5.0' }] });
    accountHistory.mockResolvedValue({ data: [], nextCursor: undefined });

    await accountGetCommand({ exchange: 'hip3', address: WALLET, dex: 'xyz', format: 'json' });
    expect(account).toHaveBeenCalledWith(WALLET, { dex: 'xyz' });

    await accountHistoryCommand({
      exchange: 'hip3',
      address: WALLET,
      start: START,
      end: END,
      dex: 'xyz',
      limit: '10',
      format: 'json',
    });
    expect(accountHistory).toHaveBeenCalledWith(WALLET, {
      start: Date.parse(START),
      end: Date.parse(END),
      dex: 'xyz',
      limit: 10,
    });
  });

  it('resolves Lighter mainnet accounts by L1 address', async () => {
    const byL1 = sdk.state.clients.lighter.accounts.byL1;
    const data = { l1Address: WALLET, totalAccounts: 2, accounts: [{ accountIndex: '1' }, { accountIndex: '9' }] };
    byL1.mockResolvedValue({ data, nextCursor: undefined });

    await accountsByL1Command({ exchange: 'lighter', l1Address: WALLET, limit: '10', format: 'json' });

    expect(byL1).toHaveBeenCalledWith(WALLET, { limit: 10 });
    expect(stdoutJson()).toEqual({ data, nextCursor: null, has_more: false });
  });

  it('writes the page to --out and prints a summary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oxa-positions-'));
    try {
      const out = join(dir, 'positions.json');
      sdk.state.clients.hyperliquid.positions.get.mockResolvedValue(WALLET_PAGE);

      await positionsGetCommand({ exchange: 'hyperliquid', address: WALLET, out, format: 'json' });

      expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({
        data: WALLET_PAGE.data,
        nextCursor: null,
        has_more: false,
        meta: WALLET_PAGE.meta,
      });
      expect(stdoutJson()).toEqual({
        written_to: out,
        records: 1,
        exchange: 'hyperliquid',
        has_more: false,
        nextCursor: null,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('validation before any request', () => {
    afterEach(() => {
      for (const venue of [
        sdk.state.clients.hyperliquid.positions,
        sdk.state.clients.hyperliquid.hip3.positions,
        sdk.state.clients.lighter.positions,
        sdk.state.clients.rhLighter!.positions,
      ]) {
        for (const method of Object.values(venue)) expect(method).not.toHaveBeenCalled();
      }
    });

    it('rejects HIP-4', () =>
      expectExit(
        () => positionsGetCommand({ exchange: 'hip4', address: WALLET, format: 'json' }),
        2,
        'Hyperliquid HIP-4 has no account positions endpoint. Use --exchange hyperliquid, hip3, lighter, or rh-lighter.',
      ));

    it('asks for an account index on Lighter and points to the L1 lookup', () =>
      expectExit(
        () => positionsGetCommand({ exchange: 'lighter', address: WALLET, format: 'json' }),
        2,
        'Lighter positions are keyed by account index. Pass --account <index>. ' +
          'Find the account indices behind an L1 address with `oxa accounts by-l1 --l1-address 0x...`.',
      ));

    it('asks for an account index on Robinhood Chain without the mainnet-only lookup', () =>
      expectExit(
        () => positionsGetCommand({ exchange: 'rh-lighter', format: 'json' }),
        2,
        'Lighter on Robinhood Chain positions are keyed by account index. Pass --account <index>.',
      ));

    it('asks for a wallet address on Hyperliquid', () =>
      expectExit(
        () => positionsGetCommand({ exchange: 'hyperliquid', account: '5', format: 'json' }),
        2,
        'Hyperliquid positions are keyed by wallet address. Pass --address 0x...',
      ));

    it.each(['0x12', 'abc', `${WALLET}0`])('rejects the address %s', (address) =>
      expectExit(
        () => positionsGetCommand({ exchange: 'hyperliquid', address, format: 'json' }),
        2,
        '--address must be a 0x-prefixed wallet address with 40 hex characters.',
      ));

    it.each(['-1', '1.5', 'abc', '99999999999999999999'])('rejects the account index %s', (account) =>
      expectExit(
        () => positionsGetCommand({ exchange: 'lighter', account, format: 'json' }),
        2,
        '--account must be a Lighter account index (a non-negative integer).',
      ));

    it('rejects --dex outside HIP-3', () =>
      expectExit(
        () => positionsGetCommand({ exchange: 'hyperliquid', address: WALLET, dex: 'xyz', format: 'json' }),
        2,
        '--dex applies to --exchange hip3 only.',
      ));

    it('rejects --include-system outside Lighter', async () => {
      await expectExit(
        () => positionsMarketCommand({ exchange: 'hip3', symbol: 'xyz:TSLA', includeSystem: true, format: 'json' }),
        2,
        '--include-system applies to --exchange lighter and rh-lighter only.',
      );
      await expectExit(
        () => positionsAllCommand({ exchange: 'hyperliquid', hour: String(HOUR), includeSystem: true, format: 'json' }),
        2,
        '--include-system applies to --exchange lighter and rh-lighter only.',
      );
      await expectExit(
        () => positionsSummaryCommand({ exchange: 'hyperliquid', symbol: 'BTC', includeSystem: true, format: 'json' }),
        2,
        '--include-system applies to --exchange lighter and rh-lighter only.',
      );
    });

    it('rejects an --hour that is not an exact hour', () =>
      expectExit(
        () => positionsAllCommand({ exchange: 'lighter', hour: '2026-09-01T12:30:00Z', format: 'json' }),
        2,
        /^--hour must be an exact UTC hour/,
      ));

    it('rejects a bad --side and --min-value', async () => {
      await expectExit(
        () => positionsMarketCommand({ exchange: 'lighter', symbol: 'ETH', side: 'up', format: 'json' }),
        2,
        '--side must be long or short.',
      );
      await expectExit(
        () => positionsMarketCommand({ exchange: 'lighter', symbol: 'ETH', minValue: '-5', format: 'json' }),
        2,
        '--min-value must be a non-negative number (USD).',
      );
    });

    it('needs both ends of a summary series', () =>
      expectExit(
        () => positionsSummaryCommand({ exchange: 'lighter', symbol: 'ETH', start: START, format: 'json' }),
        2,
        'Pass both --start and --end for an hourly series, or neither for the latest snapshot.',
      ));

    it('pages a summary only as an hourly series', () =>
      expectExit(
        () => positionsSummaryCommand({ exchange: 'rh-lighter', symbol: 'BTC', cursor: 'p2', format: 'json' }),
        2,
        '--cursor pages an hourly series: pass the same --start and --end as the first page.',
      ));

    it('keeps account summaries to Hyperliquid and HIP-3', () =>
      expectExit(
        () => accountGetCommand({ exchange: 'rh-lighter', address: WALLET, format: 'json' }),
        2,
        /^Account summaries are available for --exchange hyperliquid or hip3\./,
      ));

    it('keeps the L1 lookup to Lighter mainnet', async () => {
      await expectExit(
        () => accountsByL1Command({ exchange: 'rh-lighter', l1Address: WALLET, format: 'json' }),
        2,
        'Account lookup by L1 address is available for Lighter mainnet only (--exchange lighter).',
      );
      expect(sdk.state.clients.lighter.accounts.byL1).not.toHaveBeenCalled();
    });
  });

  it('explains an SDK install older than the floor instead of crashing', async () => {
    sdk.state.clients.rhLighter = undefined;
    await expectExit(
      () => positionsGetCommand({ exchange: 'rh-lighter', account: '1', format: 'json' }),
      5,
      'Support for Lighter on Robinhood Chain (--exchange rh-lighter) requires @0xarchive/sdk 1.12.0 or newer. ' +
        'Reinstall @0xarchive/cli to pick it up.',
    );
  });
});

describe('toEnvelope', () => {
  it('keeps data, cursor, and meta from a page', () => {
    expect(toEnvelope({ data: [1], nextCursor: 'c', meta: { quality: 'complete' } })).toEqual({
      data: [1],
      nextCursor: 'c',
      has_more: true,
      meta: { quality: 'complete' },
    });
  });

  it('reads the cursor from meta when the page does not lift it', () => {
    expect(toEnvelope({ data: [], meta: { nextCursor: 'm' } })).toEqual({
      data: [],
      nextCursor: 'm',
      has_more: true,
      meta: { nextCursor: 'm' },
    });
  });

  it('wraps a bare result', () => {
    expect(toEnvelope([1, 2])).toEqual({ data: [1, 2], nextCursor: null, has_more: false });
    expect(toEnvelope({ positions: [], account: null, meta: { stale: true } })).toEqual({
      data: { positions: [], account: null },
      nextCursor: null,
      has_more: false,
      meta: { stale: true },
    });
  });
});

describe('Lighter deployments on the shared verbs', () => {
  beforeEach(() => {
    sdk.reset();
    vi.stubEnv('OXA_API_KEY', 'test-key');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      if ((code ?? 0) === 0) return undefined as never;
      throw new ProcessExit(code ?? 0);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('accepts rh-lighter as an exchange', () => {
    expect(validateExchange('rh-lighter')).toBe('rh-lighter');
  });

  it.each([
    ['lighter', () => sdk.state.clients.lighter.liquidations],
    ['rh-lighter', () => sdk.state.clients.rhLighter!.liquidations],
  ])('serves liquidation history and volume on %s', async (exchange, resource) => {
    const rows = [{ symbol: 'BTC', timestamp: 1790294171459, liquidationType: 'partial', source: 'bucket', rawJson: '' }];
    resource().history.mockResolvedValue({ data: rows, nextCursor: 'n1' });
    resource().volume.mockResolvedValue({ data: [{ timestamp: 1790294100000, totalUsd: 12.5, count: 2 }] });

    await liquidationsCommand({ exchange, symbol: 'BTC', start: START, end: END, limit: '5', format: 'json' });
    expect(resource().history).toHaveBeenCalledWith('BTC', {
      start: Date.parse(START),
      end: Date.parse(END),
      limit: 5,
      cursor: undefined,
    });
    expect(stdoutJson()).toEqual({ data: rows, nextCursor: 'n1', has_more: true });

    await liquidationsVolumeCommand({ exchange, symbol: 'BTC', start: START, end: END, interval: '1h', format: 'pretty' });
    expect(resource().volume).toHaveBeenCalledWith('BTC', {
      start: Date.parse(START),
      end: Date.parse(END),
      interval: '1h',
      limit: undefined,
      cursor: undefined,
    });
    expect(stdoutText()).toContain('Count');
  });

  it('keeps liquidations by user to Hyperliquid', () =>
    expectExit(
      () =>
        liquidationsUserCommand({ exchange: 'rh-lighter', user: WALLET, start: START, end: END, format: 'json' }),
      2,
      'Liquidations by user is only available for --exchange hyperliquid.',
    ));

  it('still rejects HIP-4 liquidations', () =>
    expectExit(
      () => liquidationsCommand({ exchange: 'hip4', symbol: '0', start: START, end: END, format: 'json' }),
      2,
      'HIP-4 has no liquidations endpoint. Use --exchange hyperliquid, hip3, lighter, or rh-lighter.',
    ));

  it('fetches Robinhood Chain trades: recent tier without a range, canonical tier with one', async () => {
    const trades = sdk.state.clients.rhLighter!.trades;
    trades.recent.mockResolvedValue([]);
    trades.list.mockResolvedValue({
      data: [],
      nextCursor: undefined,
      meta: { finalizedThrough: '2026-09-25T00:00:00Z', clampedTo: '2026-09-25T00:00:00Z' },
    });

    await tradesFetchCommand({ exchange: 'rh-lighter', symbol: 'AAPL-USDG', format: 'json' });
    expect(trades.recent).toHaveBeenCalledWith('AAPL-USDG', 100);

    await tradesFetchCommand({ exchange: 'rh-lighter', symbol: 'BTC', start: START, end: END, format: 'json' });
    expect(trades.list).toHaveBeenCalledWith('BTC', {
      start: Date.parse(START),
      end: Date.parse(END),
      limit: undefined,
      cursor: undefined,
    });
    expect(stdoutJson()).toEqual({
      data: [],
      nextCursor: null,
      has_more: false,
      meta: { finalizedThrough: '2026-09-25T00:00:00Z', clampedTo: '2026-09-25T00:00:00Z' },
    });
  });

  it('keeps Hyperliquid ranged trades output unchanged: no meta passthrough', async () => {
    const trades = sdk.state.clients.hyperliquid.trades;
    trades.list.mockResolvedValue({
      data: [],
      nextCursor: 'c1',
      meta: { count: 0, requestId: 'r1', nextCursor: 'c1' },
    });

    await tradesFetchCommand({ exchange: 'hyperliquid', symbol: 'BTC', start: START, end: END, format: 'json' });
    expect(trades.list).toHaveBeenCalledWith('BTC', {
      start: Date.parse(START),
      end: Date.parse(END),
      limit: undefined,
      cursor: undefined,
    });
    expect(stdoutJson()).toEqual({ data: [], nextCursor: 'c1', has_more: true });
  });

  it.each([
    [() => ordersHistoryCommand({ exchange: 'rh-lighter', symbol: 'BTC', start: START, end: END, format: 'json' }),
      'Lighter on Robinhood Chain has no order history endpoint. Use --exchange hyperliquid, hip3, hip4, or spot.'],
    [() => l4GetCommand({ exchange: 'lighter', symbol: 'BTC', format: 'json' }),
      'Lighter has no L4 order book endpoint. Use --exchange hyperliquid, hip3, hip4, or spot.'],
    [() => l2GetCommand({ exchange: 'rh-lighter', symbol: 'BTC', format: 'json' }),
      'Lighter on Robinhood Chain has no derived L2 order book endpoint. Use --exchange hyperliquid or hip3.'],
  ])('rejects order-level routes on Lighter deployments (%#)', (run, message) => expectExit(run, 2, message));
});
