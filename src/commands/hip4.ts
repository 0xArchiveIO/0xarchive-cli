// Thin HIP-4 command surface — maps `oxa hip4 <verb> <coin>` to the underlying
// shared command implementations with `--exchange hip4` baked in. Coins are
// passed positionally as bare numerics (e.g. `oxa hip4 orderbook 0`, where `0`
// means outcome 0 / side 0). The legacy `#0` / `%230` forms still work because
// `encodeHip4Coin` normalizes them.
//
// HIP-4 has no funding or liquidations by design. Candles and per-side OI are
// available through their dedicated routes.

import { orderbookGetCommand, orderbookHistoryCommand } from './orderbook.js';
import { tradesFetchCommand } from './trades.js';
import { candlesCommand } from './candles.js';
import { instrumentsCommand } from './instruments.js';
import { oiCurrentCommand, oiHistoryCommand } from './openinterest.js';
import { summaryCommand } from './summary.js';
import { freshnessCommand } from './freshness.js';
import { pricesCommand } from './prices.js';
import { ordersHistoryCommand, ordersFlowCommand, ordersTpslCommand } from './orders.js';
import { l4GetCommand, l4DiffsCommand, l4HistoryCommand } from './l4.js';
import { outcomesListCommand, outcomesGetCommand } from './outcomes.js';
import { resolveApiKey, createClient } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseIntInRange } from '../lib/params.js';
import { getHip4QuestionsResource } from '../lib/sdk.js';
import { cell, emitDocument, emitPage, field, printMore, toPage } from '../lib/emit.js';
import { compact } from '../lib/positions.js';

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

// ── candles ────────────────────────────────────────────────────────────────

export async function hip4Candles(
  coin: string,
  options: BaseFormatOpts & {
    start: string;
    end: string;
    interval?: string;
    limit?: string;
    cursor?: string;
    out?: string;
  },
): Promise<void> {
  return candlesCommand({ ...options, exchange: 'hip4', symbol: coin });
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
    cursor?: string;
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

// ── questions ──────────────────────────────────────────────────────────────
// A question groups binary outcomes under one ballot: one named outcome per
// choice, plus a fallback outcome that resolves Yes when no named choice does.

function questionRow(q: unknown): string[] {
  const named = field(q, 'namedOutcomeIds', 'named_outcome_ids');
  const settled = field(q, 'settledNamedOutcomes', 'settled_named_outcomes');
  return [
    cell(field(q, 'questionId', 'question_id')),
    cell(field(q, 'name')),
    Array.isArray(named) ? named.join(', ') : '-',
    cell(field(q, 'fallbackOutcomeId', 'fallback_outcome_id')),
    Array.isArray(settled) ? String(settled.length) : '-',
    cell(field(q, 'description')),
  ];
}

export async function hip4QuestionsList(options: {
  limit?: string;
  cursor?: string;
  apiKey?: string;
  format: string;
}): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseIntInRange(options.limit, 'limit', 1, 1000);
  const client = createClient(apiKey);

  const resource = getHip4QuestionsResource(client);
  try {
    const result = await resource.list(compact({ limit, cursor: options.cursor }));
    const page = toPage(result);
    const questions = Array.isArray(page.data) ? page.data : [];
    emitPage(page, { format }, {}, () => {
      prettyHeader(`HIP-4 Questions, ${questions.length} on this page`);
      if (questions.length === 0) {
        prettyDim('No questions found.');
        return;
      }
      const shown = questions.slice(0, 20);
      prettyTable(['Question', 'Name', 'Named Outcomes', 'Fallback', 'Settled', 'Description'], shown.map(questionRow));
      printMore(shown.length, questions.length, page.nextCursor);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function hip4QuestionsGet(
  questionId: string,
  options: { apiKey?: string; format: string },
): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  if (!/^\d+$/.test(questionId)) {
    exitError(`Invalid question_id "${questionId}". Must be a non-negative integer.`, EXIT.VALIDATION);
  }
  const client = createClient(apiKey);

  const resource = getHip4QuestionsResource(client);
  try {
    const question = await resource.get(Number(questionId));
    emitDocument(question, { format }, () => {
      const named = field(question, 'namedOutcomeIds', 'named_outcome_ids');
      const settled = field(question, 'settledNamedOutcomes', 'settled_named_outcomes');
      prettyHeader(`HIP-4 Question ${questionId}`);
      prettyField('Name', field(question, 'name') as string | undefined);
      prettyField('Description', field(question, 'description') as string | undefined);
      prettyField('Named outcomes', Array.isArray(named) ? named.join(', ') : undefined);
      prettyField('Fallback outcome', field(question, 'fallbackOutcomeId', 'fallback_outcome_id') as number | undefined);
      prettyField('Settled named outcomes', Array.isArray(settled) ? settled.join(', ') || 'none' : undefined);
      prettyField('First seen', field(question, 'firstSeenAt', 'first_seen_at') as string | undefined);
      prettyField('Last updated', field(question, 'lastUpdatedAt', 'last_updated_at') as string | undefined);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
