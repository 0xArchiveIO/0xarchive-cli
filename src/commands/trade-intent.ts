// `oxa trade-intent history --symbol <symbol>` (also `oxa trade-intent history
// <symbol>`): why one Hyperliquid or HIP-3 market traded, bucket by bucket.
// USD volume of new longs and shorts, profit taken, stopped out and flips,
// market makers apart, and the market's trailing-72h winners and losers as
// aggregates. Build and above.

import { resolveApiKey, createClient, exchangeLabel } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp } from '../lib/time.js';
import { parseChoice, parseIntInRange } from '../lib/params.js';
import { getTradeIntentResource, hyperliquidVenue } from '../lib/sdk.js';
import { cell, emitPage, field, pickMeta, printMore, toPage } from '../lib/emit.js';
import { compact } from '../lib/positions.js';

/** Bucket widths the route accepts, on UTC epoch boundaries (`1d` is the UTC day). */
export const TRADE_INTENT_INTERVALS = ['1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1d'] as const;

/** The `meta` fields kept in the JSON output: how far the series is built, preliminary rows, coverage. */
const META_KEYS = ['builtThrough', 'preliminaryRowCount', 'coverageFrom', 'notice'] as const;

interface TradeIntentOptions {
  exchange: string;
  symbol?: string;
  start?: string;
  end?: string;
  interval?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

export async function tradeIntentHistoryCommand(
  positional: string | undefined,
  options: TradeIntentOptions,
): Promise<void> {
  if (positional !== undefined && options.symbol !== undefined && positional !== options.symbol) {
    exitError(`Two symbols given ("${positional}" and --symbol "${options.symbol}"). Pass one.`, EXIT.VALIDATION);
  }
  const symbol = positional ?? options.symbol;
  if (symbol === undefined) {
    exitError('A symbol is required: oxa trade-intent history --exchange <exchange> --symbol <symbol>.', EXIT.VALIDATION);
  }
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, 'trade intent');
  const apiKey = resolveApiKey(options.apiKey);
  const interval = parseChoice(options.interval, 'interval', TRADE_INTENT_INTERVALS);
  const limit = parseIntInRange(options.limit, 'limit', 1, 2000);
  const start = options.start !== undefined ? parseTimestamp(options.start, 'start') : undefined;
  const end = options.end !== undefined ? parseTimestamp(options.end, 'end') : undefined;
  if (start !== undefined && end !== undefined && start > end) {
    exitError('--start must not be after --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);
  const tradeIntent = getTradeIntentResource(client, venue);
  try {
    const result = await tradeIntent.history(
      symbol,
      compact({ start, end, interval, limit, cursor: options.cursor }),
    );
    const page = toPage(result);
    const meta = pickMeta(result.meta, META_KEYS);
    if (meta) page.meta = meta;
    const buckets = Array.isArray(page.data) ? page.data : [];

    emitPage(page, { format, out: options.out }, { exchange: venue, symbol }, () => {
      prettyHeader(`${symbol} Trade Intent (${exchangeLabel(venue)}), ${buckets.length} buckets`);
      prettyField('Interval', interval ?? '1h');
      prettyField('Built through', field(meta, 'builtThrough') as string | undefined);
      prettyField('Preliminary buckets', field(meta, 'preliminaryRowCount') as number | undefined);
      prettyField('Notice', field(meta, 'notice') as string | undefined);
      if (buckets.length === 0) {
        prettyDim('No buckets in this window.');
        return;
      }
      const shown = buckets.slice(0, 20);
      prettyTable(
        ['Bucket (UTC)', 'Open Long', 'Open Short', 'TP Long', 'TP Short', 'Stop Long', 'Stop Short', 'Flip L>S', 'Flip S>L', 'MM USD', 'Final'],
        shown.map((b) => [
          cell(field(b, 'timestamp')),
          cell(field(b, 'openLong', 'open_long')),
          cell(field(b, 'openShort', 'open_short')),
          cell(field(b, 'tpLong', 'tp_long')),
          cell(field(b, 'tpShort', 'tp_short')),
          cell(field(b, 'stopLong', 'stop_long')),
          cell(field(b, 'stopShort', 'stop_short')),
          cell(field(b, 'flipLs', 'flip_ls')),
          cell(field(b, 'flipSl', 'flip_sl')),
          cell(field(b, 'mmUsd', 'mm_usd')),
          field(b, 'isFinal', 'is_final') === true ? 'yes' : 'no',
        ]),
      );
      printMore(shown.length, buckets.length, page);
      prettyDim('USD per bucket; both sides of every trade count, market makers only in MM USD.');
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
