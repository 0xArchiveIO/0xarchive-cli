import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateInterval } from '../src/lib/time.js';

class ProcessExit extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

describe('aggregation interval validation', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExit(code ?? 0);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts every aggregation interval the API serves, including 1m', () => {
    for (const interval of ['1m', '5m', '15m', '30m', '1h', '4h', '1d']) {
      expect(validateInterval(interval)).toBe(interval);
    }
    expect(validateInterval(undefined)).toBeUndefined();
  });

  it('refuses intervals the API refuses before any request is sent', () => {
    for (const interval of ['2h', '1w', '1s', '']) {
      expect(() => validateInterval(interval)).toThrow(ProcessExit);
    }
  });
});
