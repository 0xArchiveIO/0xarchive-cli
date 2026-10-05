import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CELL, formatCell, formatNumber, prettyTable } from '../src/lib/output.js';

function printed(): string {
  return vi
    .mocked(process.stdout.write)
    .mock.calls.map(([chunk]) => String(chunk))
    .join('');
}

describe('pretty tables', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints numeric, boolean, missing and object cells', () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    prettyTable(
      ['Timestamp', 'Open', 'Volume', 'Final', 'Note'],
      [
        ['2026-10-04T00:00:00.000Z', 86464.5, 12.25, true, null],
        ['2026-10-04T01:00:00.000Z', 0.0000001, 1e21, false, { source: 'ws' }],
        ['2026-10-04T02:00:00.000Z', 0, undefined],
      ],
    );
    const lines = printed().split('\n').filter(Boolean);
    expect(lines).toHaveLength(5);
    expect(lines[2]).toMatch(/2026-10-04T00:00:00\.000Z\s+86464\.5\s+12\.25\s+true\s+-/);
    expect(lines[3]).toMatch(/0\.0000001\s+1000000000000000000000\s+false\s+\{"source":"ws"\}/);
    expect(lines[4]).toMatch(/2026-10-04T02:00:00\.000Z\s+0\s+-\s+-\s+-/);
  });

  it('pads every column to its widest formatted cell', () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    prettyTable(['A', 'B'], [[123456, 'x'], [1, 'y']]);
    const lines = printed().split('\n').filter(Boolean);
    expect(lines[2]).toBe('  123456  x');
    expect(lines[3]).toBe('  1       y');
  });
});

describe('cell formatting', () => {
  it.each([
    [86464.5, '86464.5'],
    [-3, '-3'],
    [0.0000057534, '0.0000057534'],
    [1e-7, '0.0000001'],
    [2.5e-12, '0.0000000000025'],
    [1e21, '1000000000000000000000'],
    [Number.NaN, 'NaN'],
  ])('writes %s as %s', (value, text) => {
    expect(formatNumber(value)).toBe(text);
  });

  it.each([
    ['BTC', 'BTC'],
    ['', ''],
    [null, EMPTY_CELL],
    [undefined, EMPTY_CELL],
    [true, 'true'],
    [12n, '12'],
    [[1, 2], '[1,2]'],
  ])('writes cell %# as its text', (value, text) => {
    expect(formatCell(value)).toBe(text);
  });
});
