// `oxa factors momentum get|current|returns --lookback 7d|14d`: the momentum
// factor on Hyperliquid perps. `get` and `current` are one hour's reading of
// every eligible perp, strongest first; `returns` is the long-short factor's
// return per bucket, oldest first, cursor-paged. Hyperliquid only; Build and
// above.

import { resolveApiKey, listOr, requireExchange, validateExchange } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp } from '../lib/time.js';
import { parseChoice, parseIntInRange } from '../lib/params.js';
import { cell, emitPage, field, pickMeta, printMore, toPage } from '../lib/emit.js';
import { compact } from '../lib/positions.js';
import {
  MOMENTUM_INTERVALS,
  MOMENTUM_LOOKBACKS,
  MOMENTUM_UNIVERSES,
  MomentumClient,
  type MomentumLookback,
} from '../lib/momentum.js';
import type { CursorPage } from '../lib/http.js';

const FEATURE = 'momentum factor';
const META_KEYS = ['coverageFrom', 'notice'] as const;

interface MomentumCurrentOptions {
  exchange: string;
  lookback?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

interface MomentumGetOptions extends MomentumCurrentOptions {
  at?: string;
}

interface MomentumReturnsOptions extends MomentumCurrentOptions {
  universe?: string;
  start?: string;
  end?: string;
  interval?: string;
  limit?: string;
  cursor?: string;
  holdings?: boolean;
}

/** The momentum factor is served for Hyperliquid perps only. */
function hyperliquidOnly(raw: string): 'hyperliquid' {
  const exchange = validateExchange(raw);
  requireExchange(exchange, ['hyperliquid'] as const, FEATURE);
  return exchange;
}

/** `--lookback`, required: 7d or 14d. */
function lookback(raw: string | undefined): MomentumLookback {
  if (raw === undefined) {
    exitError(`--lookback is required: the momentum lookback, ${listOr(MOMENTUM_LOOKBACKS)}.`, EXIT.VALIDATION);
  }
  return parseChoice(raw, 'lookback', MOMENTUM_LOOKBACKS) as MomentumLookback;
}

/** The page as the CLI's JSON envelope, keeping `meta.coverageFrom` and `meta.notice`. */
function envelope(result: CursorPage<unknown[]>) {
  const page = toPage(result);
  const meta = pickMeta(result.meta, META_KEYS);
  if (meta) page.meta = meta;
  return { page, meta, records: Array.isArray(page.data) ? page.data : [] };
}

/** Yes or no for a boolean field. */
function yesNo(value: unknown): string {
  return value === true ? 'yes' : value === false ? 'no' : '-';
}

async function scores(
  options: MomentumGetOptions,
  read: (client: MomentumClient, lb: MomentumLookback) => Promise<CursorPage<unknown[]>>,
  title: string,
): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = hyperliquidOnly(options.exchange);
  const lb = lookback(options.lookback);
  const apiKey = resolveApiKey(options.apiKey);

  const client = new MomentumClient(apiKey);
  try {
    const { page, meta, records } = envelope(await read(client, lb));
    emitPage(page, { format, out: options.out }, { exchange, lookback: lb }, () => {
      prettyHeader(`Hyperliquid ${title}, ${lb} lookback (${records.length} perps)`);
      prettyField('As of', field(records[0], 'timestamp') as string | undefined);
      prettyField('Method', field(records[0], 'method') as string | undefined);
      if (records.length > 0) prettyField('Final', yesNo(field(records[0], 'isFinal', 'is_final')));
      prettyField('Notice', field(meta, 'notice') as string | undefined);
      if (records.length === 0) {
        prettyDim('No reading at this time.');
        return;
      }
      const shown = records.slice(0, 20);
      prettyTable(
        ['Symbol', 'Return', 'Volatility', 'Score', 'Pct Rank', 'Quintile', 'Top 25', 'Top 50'],
        shown.map((r) => [
          cell(field(r, 'symbol')),
          cell(field(r, 'ret') ?? null),
          cell(field(r, 'vol') ?? null),
          cell(field(r, 'score')),
          cell(field(r, 'pctRank', 'pct_rank')),
          cell(field(r, 'quintile')),
          yesNo(field(r, 'inTop25', 'in_top25')),
          yesNo(field(r, 'inTop50', 'in_top50')),
        ]),
      );
      if (records.length > shown.length) {
        prettyDim(`... and ${records.length - shown.length} more (strongest first; use JSON output for every perp)`);
      }
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

/** `oxa factors momentum get`: every eligible perp's reading as of `--at` (default now). */
export async function momentumGetCommand(options: MomentumGetOptions): Promise<void> {
  const at = options.at !== undefined ? parseTimestamp(options.at, 'at') : undefined;
  return scores(options, (client, lb) => client.get(compact({ lookback: lb, at })), 'Momentum');
}

/** `oxa factors momentum current`: the newest reading. */
export async function momentumCurrentCommand(options: MomentumCurrentOptions): Promise<void> {
  return scores(options, (client, lb) => client.current({ lookback: lb }), 'Momentum, newest reading');
}

/** `oxa factors momentum returns`: the long-short factor's return per bucket. */
export async function momentumReturnsCommand(options: MomentumReturnsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = hyperliquidOnly(options.exchange);
  const lb = lookback(options.lookback);
  const universe = parseChoice(options.universe, 'universe', MOMENTUM_UNIVERSES);
  const interval = parseChoice(options.interval, 'interval', MOMENTUM_INTERVALS);
  const limit = parseIntInRange(options.limit, 'limit', 1, 1000);
  const start = options.start !== undefined ? parseTimestamp(options.start, 'start') : undefined;
  const end = options.end !== undefined ? parseTimestamp(options.end, 'end') : undefined;
  if (start !== undefined && end !== undefined && start > end) {
    exitError('--start must not be after --end', EXIT.VALIDATION);
  }
  const holdings = options.holdings === true ? true : undefined;
  const apiKey = resolveApiKey(options.apiKey);

  const client = new MomentumClient(apiKey);
  try {
    const result = await client.returns(
      compact({ lookback: lb, universe, start, end, interval, cursor: options.cursor, limit, holdings }),
    );
    const { page, meta, records } = envelope(result);
    // The universe the records were built on, as served (top25 when none was asked for).
    const shownUniverse = (field(records[0], 'universe') as string | undefined) ?? universe ?? 'top25';
    emitPage(page, { format, out: options.out }, { exchange, lookback: lb, universe: shownUniverse }, () => {
      prettyHeader(
        `Hyperliquid Momentum Factor Returns, ${lb} lookback, ${shownUniverse} (${records.length} buckets)`,
      );
      prettyField('Interval', interval ?? '1d');
      prettyField('Method', field(records[0], 'method') as string | undefined);
      prettyField('Notice', field(meta, 'notice') as string | undefined);
      if (records.length === 0) {
        prettyDim('No buckets in this window.');
        printMore(0, 0, page);
        return;
      }
      const shown = records.slice(0, 20);
      const headers = ['Bucket (UTC)', 'Calculated At', 'Return', 'Long', 'Short', 'Hours', 'Longs', 'Shorts', 'Final'];
      if (holdings) headers.push('Holdings');
      prettyTable(
        headers,
        shown.map((r) => {
          const row = [
            cell(field(r, 'timestamp')),
            cell(field(r, 'calculatedAt', 'calculated_at')),
            cell(field(r, 'ret')),
            cell(field(r, 'longRet', 'long_ret')),
            cell(field(r, 'shortRet', 'short_ret')),
            cell(field(r, 'hours')),
            cell(field(r, 'longs')),
            cell(field(r, 'shorts')),
            yesNo(field(r, 'isFinal', 'is_final')),
          ];
          if (holdings) {
            const held = field(r, 'holdings');
            row.push(Array.isArray(held) ? String(held.length) : '-');
          }
          return row;
        }),
      );
      if (holdings) prettyDim('Each bucket\'s holdings and weights are in the JSON output.');
      printMore(shown.length, records.length, page);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
