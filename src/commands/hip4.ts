// Thin HIP-4 command surface — maps `oxa hip4 <verb> <coin>` to the underlying
// shared command implementations with `--exchange hip4` baked in. Coins are
// passed positionally as bare numerics (e.g. `oxa hip4 orderbook 0`, where `0`
// means outcome 0 / side 0). The legacy `#0` / `%230` forms still work because
// `encodeHip4Coin` normalizes them.
//
// HIP-4 has no funding/liquidations/candles by design, so those verbs are
// intentionally absent from this group.

import { orderbookGetCommand, orderbookHistoryCommand } from './orderbook.js';
import { tradesFetchCommand } from './trades.js';
import { instrumentsCommand } from './instruments.js';
import { oiCurrentCommand, oiHistoryCommand } from './openinterest.js';
import { summaryCommand } from './summary.js';
import { freshnessCommand } from './freshness.js';
import { pricesCommand } from './prices.js';
import { ordersHistoryCommand, ordersFlowCommand, ordersTpslCommand } from './orders.js';
import { l4GetCommand, l4DiffsCommand, l4HistoryCommand } from './l4.js';
import { outcomesListCommand, outcomesGetCommand } from './outcomes.js';

interface BaseFormatOpts {
  apiKey?: string;
  format: string;
}

// ── orderbook ──────────────────────────────────────────────────────────────

export async function hip4OrderbookGet(
  coin: string,
  options: BaseFormatOpts & { depth?: string; timestamp?: string },
): Promise<void> {
  return orderbookGetCommand({ ...options, exchange: 'hip4', symbol: coin });
}

export async function hip4OrderbookHistory(
  coin: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    depth?: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  return orderbookHistoryCommand({ ...options, exchange: 'hip4', symbol: coin });
}

// ── trades ─────────────────────────────────────────────────────────────────

export async function hip4Trades(
  coin: string,
  options: BaseFormatOpts & {
    start?: string;
    end?: string;
    limit?: string;
    cursor?: string;
    out?: string;
    recent?: boolean;
  },
): Promise<void> {
  // `--recent` is a convenience alias: omit start/end so trades.fetch falls
  // through to the recent-trades path on HIP-4.
  const { recent: _recent, ...rest } = options;
  return tradesFetchCommand({ ...rest, exchange: 'hip4', symbol: coin });
}

// ── instruments ────────────────────────────────────────────────────────────

export async function hip4Instruments(options: BaseFormatOpts): Promise<void> {
  return instrumentsCommand({ ...options, exchange: 'hip4' });
}

// ── open interest ──────────────────────────────────────────────────────────

export async function hip4OiCurrent(coin: string, options: BaseFormatOpts): Promise<void> {
  return oiCurrentCommand({ ...options, exchange: 'hip4', symbol: coin });
}

export async function hip4OiHistory(
  coin: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    interval?: string;
    limit?: string;
    cursor?: string;
  },
): Promise<void> {
  return oiHistoryCommand({ ...options, exchange: 'hip4', symbol: coin });
}

// ── summary / freshness / prices ───────────────────────────────────────────

export async function hip4Summary(coin: string, options: BaseFormatOpts): Promise<void> {
  return summaryCommand({ ...options, exchange: 'hip4', symbol: coin });
}

export async function hip4Freshness(coin: string, options: BaseFormatOpts): Promise<void> {
  return freshnessCommand({ ...options, exchange: 'hip4', symbol: coin });
}

export async function hip4Prices(
  coin: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    interval?: string;
    limit?: string;
    cursor?: string;
  },
): Promise<void> {
  return pricesCommand({ ...options, exchange: 'hip4', symbol: coin });
}

// ── orders ─────────────────────────────────────────────────────────────────

export async function hip4OrdersHistory(
  coin: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    user?: string;
    status?: string;
    orderType?: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  return ordersHistoryCommand({ ...options, exchange: 'hip4', symbol: coin });
}

export async function hip4OrdersFlow(
  coin: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    interval?: string;
    limit?: string;
    out?: string;
  },
): Promise<void> {
  return ordersFlowCommand({ ...options, exchange: 'hip4', symbol: coin });
}

export async function hip4OrdersTpsl(
  coin: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    user?: string;
    triggered?: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  return ordersTpslCommand({ ...options, exchange: 'hip4', symbol: coin });
}

// ── L4 ─────────────────────────────────────────────────────────────────────

export async function hip4L4Get(
  coin: string,
  options: BaseFormatOpts & { timestamp?: string; depth?: string },
): Promise<void> {
  return l4GetCommand({ ...options, exchange: 'hip4', symbol: coin });
}

export async function hip4L4Diffs(
  coin: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  return l4DiffsCommand({ ...options, exchange: 'hip4', symbol: coin });
}

export async function hip4L4History(
  coin: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  return l4HistoryCommand({ ...options, exchange: 'hip4', symbol: coin });
}

// ── outcomes ───────────────────────────────────────────────────────────────

export async function hip4OutcomesList(options: {
  settled?: string;
  limit?: string;
  cursor?: string;
  apiKey?: string;
  format: string;
}): Promise<void> {
  return outcomesListCommand(options);
}

export async function hip4OutcomesGet(
  outcomeId: string,
  options: { apiKey?: string; format: string },
): Promise<void> {
  return outcomesGetCommand({ outcomeId, ...options });
}
