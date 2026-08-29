import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  breadthCurrentCommand,
  breadthHistoryCommand,
} from '../src/commands/breadth.js';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tsx = resolve(repoRoot, 'node_modules/.bin/tsx');

class ProcessExit extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

function runHelp(...args: string[]) {
  return spawnSync(tsx, ['src/cli.ts', ...args, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
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

function emptySnapshot() {
  return {
    session_date: '2026-08-28',
    calculated_at: '2026-08-28T12:00:00Z',
    value_pct: null,
    coverage_ratio: 0,
    counts: {
      candidates: 2,
      eligible: 0,
      above: 0,
      at: 0,
      below: 0,
      excluded_no_session_volume: 1,
      excluded_stale_price: 1,
    },
    namespaces: {
      eligible: {},
      above: {},
      at: {},
      below: {},
    },
  };
}

describe('HIP-3 breadth CLI', () => {
  beforeEach(() => {
    vi.stubEnv('OXA_API_KEY', 'test-key');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('registers current and history commands with the complete public help surface', () => {
    const current = runHelp('breadth', 'current');
    expect(current.status).toBe(0);
    expect(current.stdout).toContain('Usage: oxa breadth current [options]');
    expect(current.stdout).toContain('Get current HIP-3 breadth');
    expect(current.stdout).toContain('--exchange <exchange>');
    expect(current.stdout).toContain('--format <format>');

    const history = runHelp('breadth', 'history');
    expect(history.status).toBe(0);
    expect(history.stdout).toContain('Usage: oxa breadth history [options]');
    expect(history.stdout).toContain('Get historical HIP-3 breadth');
    const normalizedHistoryHelp = history.stdout.replace(/\s+/g, ' ');
    expect(normalizedHistoryHelp).toContain('history begins on 2026-08-28');
    for (const option of [
      '--exchange <exchange>',
      '--start <time>',
      '--end <time>',
      '--interval <interval>',
      '--limit <n>',
      '--cursor <cursor>',
      '--out <path>',
      '--format <format>',
    ]) {
      expect(history.stdout).toContain(option);
    }
  });

  it('calls the typed current resource and preserves a null value in JSON output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeApiResponse({
        success: true,
        data: emptySnapshot(),
        meta: { count: 1, request_id: 'breadth-current' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    interceptExit();

    const stdout = vi.mocked(process.stdout.write);
    await expect(
      breadthCurrentCommand({ exchange: 'hip3', format: 'json', apiKey: 'test-key' }),
    ).resolves.toBeUndefined();

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/v1/hyperliquid/hip3/breadth/above-vwap/current');
    expect([...requestUrl.searchParams]).toEqual([]);
    const output = JSON.parse(String(stdout.mock.calls[0][0]));
    expect(output.valuePct).toBeNull();
    expect(String(stdout.mock.calls[0][0])).not.toContain('0%');
  });

  it('calls typed history with all supported parameters and keeps the cursor unchanged', async () => {
    const snapshot = {
      ...emptySnapshot(),
      calculated_at: '2026-08-28T12:05:00Z',
      value_pct: 20.93,
      coverage_ratio: 0.5,
      counts: {
        ...emptySnapshot().counts,
        candidates: 4,
        eligible: 2,
        above: 1,
        below: 1,
        excluded_no_session_volume: 1,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      fakeApiResponse({
        success: true,
        data: [snapshot],
        meta: {
          count: 1,
          next_cursor: '1788048300000',
          request_id: 'breadth-history',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    interceptExit();

    const stdout = vi.mocked(process.stdout.write);
    await expect(
      breadthHistoryCommand({
        exchange: 'hip3',
        start: '2026-08-28T00:00:00Z',
        end: '2026-08-29T00:00:00Z',
        interval: '5m',
        limit: '1000',
        cursor: '1788048000000',
        format: 'json',
        apiKey: 'test-key',
      }),
    ).resolves.toBeUndefined();

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/v1/hyperliquid/hip3/breadth/above-vwap');
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      start: String(Date.parse('2026-08-28T00:00:00Z')),
      end: String(Date.parse('2026-08-29T00:00:00Z')),
      interval: '5m',
      limit: '1000',
      cursor: '1788048000000',
    });

    const output = JSON.parse(String(stdout.mock.calls[0][0]));
    expect(output.data[0].valuePct).toBe(20.93);
    expect(output.nextCursor).toBe('1788048300000');
  });

  it('renders an unavailable value instead of zero in pretty history output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeApiResponse({
        success: true,
        data: [emptySnapshot()],
        meta: { count: 1, request_id: 'breadth-pretty' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    interceptExit();

    const stdout = vi.mocked(process.stdout.write);
    await expect(
      breadthHistoryCommand({ exchange: 'hip3', format: 'pretty', apiKey: 'test-key' }),
    ).resolves.toBeUndefined();

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).toContain('unavailable');
    expect(output).not.toContain('0%');
  });

  it('rejects a history limit above the route maximum before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    interceptExit();

    await expect(
      breadthHistoryCommand({
        exchange: 'hip3',
        limit: '1001',
        format: 'json',
        apiKey: 'test-key',
      }),
    ).rejects.toMatchObject({ code: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('documents the breadth history start date', () => {
    const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
    expect(readme).toContain('History begins on 2026-08-28');
  });
});
