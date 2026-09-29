// Flags shared by the liquidation-levels and trigger-levels commands, mapped
// to the API's parameter names (range_pct, buckets, side, ...).

import { exitError, EXIT } from './output.js';
import { parseTimestamp } from './time.js';
import { parseChoice, parseIntInRange, parseNumberInRange } from './params.js';
import { compact } from './positions.js';

/** Side filter: bid/buy/B keeps the long (bid) side, ask/sell/A the short (ask) side. */
export const LEVEL_SIDES = ['bid', 'ask', 'buy', 'sell', 'B', 'A'] as const;

export interface LevelOptions {
  rangePct?: string;
  buckets?: string;
  side?: string;
}

export interface LevelHistoryOptions extends LevelOptions {
  start?: string;
  end?: string;
  limit?: string;
  cursor?: string;
  summary?: boolean;
}

export function levelParams(options: LevelOptions): Record<string, unknown> {
  return compact({
    range_pct: parseNumberInRange(options.rangePct, 'range-pct', 1, 50),
    buckets: parseIntInRange(options.buckets, 'buckets', 10, 200),
    side: parseChoice(options.side, 'side', LEVEL_SIDES),
  });
}

export function levelHistoryParams(options: LevelHistoryOptions): Record<string, unknown> {
  const start = options.start !== undefined ? parseTimestamp(options.start, 'start') : undefined;
  const end = options.end !== undefined ? parseTimestamp(options.end, 'end') : undefined;
  if (start !== undefined && end !== undefined && start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }
  return compact({
    start,
    end,
    limit: parseIntInRange(options.limit, 'limit', 1, 100),
    cursor: options.cursor,
    summary: options.summary ? true : undefined,
    ...levelParams(options),
  });
}
