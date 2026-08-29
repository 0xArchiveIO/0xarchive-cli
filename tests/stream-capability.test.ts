import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIGHTER_REPLAY_CHANNELS,
  LIGHTER_SUBSCRIPTION_ERROR,
  streamGenericCommand,
} from '../src/commands/stream.js';

class ProcessExit extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

const lighterChannels = [
  'lighter_orderbook',
  'lighter_trades',
  'lighter_candles',
  'lighter_open_interest',
  'lighter_funding',
  'lighter_l3_orderbook',
] as const;

describe('Lighter stream capability', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines exactly the six replay-only Lighter channels', () => {
    expect([...LIGHTER_REPLAY_CHANNELS].sort()).toEqual([...lighterChannels].sort());
  });

  it.each(lighterChannels)('rejects %s as a live stream before opening a socket', async (channel) => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExit(code ?? 0);
    }) as never);

    await expect(streamGenericCommand(channel, 'BTC', { format: 'json' })).rejects.toMatchObject({
      code: 2,
    });
    expect(process.stderr.write).toHaveBeenCalledWith(
      JSON.stringify({
        error: LIGHTER_SUBSCRIPTION_ERROR,
        code: 2,
        type: 'validation',
      }) + '\n',
    );
  });
});
