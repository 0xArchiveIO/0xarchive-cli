// `oxa cvd history --symbol <symbol>` (also `oxa cvd <symbol>`): cumulative
// volume delta on Hyperliquid core and HIP-3.
// Taker buy and sell notional per bucket, their difference, and a running
// total that restarts on every page.

import { resolveApiKey, createClient, exchangeLabel } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp, validateCandleInterval } from '../lib/time.js';
import { parseIntInRange } from '../lib/params.js';
import { getCvdResource, hyperliquidVenue } from '../lib/sdk.js';
import { cell, emitPage, field, isoTime, printMore, toPage } from '../lib/emit.js';
import { compact } from '../lib/positions.js';

interface CvdOptions {
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

export async function cvdCommand(positional: string | undefined, options: CvdOptions): Promise<void> {
  if (positional !== undefined && options.symbol !== undefined && positional !== options.symbol) {
    exitError(`Two symbols given ("${positional}" and --symbol "${options.symbol}"). Pass one.`, EXIT.VALIDATION);
  }
  const symbol = positional ?? options.symbol;
  if (symbol === undefined) {
    exitError('A symbol is required: oxa cvd history --exchange <exchange> --symbol <symbol>.', EXIT.VALIDATION);
  }
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, 'CVD');
  const apiKey = resolveApiKey(options.apiKey);
  const interval = validateCandleInterval(options.interval);
  const limit = parseIntInRange(options.limit, 'limit', 1, 10_000);
  const start = options.start !== undefined ? parseTimestamp(options.start, 'start') : undefined;
  const end = options.end !== undefined ? parseTimestamp(options.end, 'end') : undefined;
  if (start !== undefined && end !== undefined && start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  const cvd = getCvdResource(client, venue);
  try {
    const result = await cvd.history(
      symbol,
      compact({ start, end, interval, limit, cursor: options.cursor }),
    );
    // meta.notice says when a response is one page of several.
    const notice = field(result.meta, 'notice');
    const page = toPage(result);
    if (typeof notice === 'string') page.meta = { notice };
    const buckets = Array.isArray(page.data) ? page.data : [];

    emitPage(page, { format, out: options.out }, { exchange: venue, symbol }, () => {
      prettyHeader(`${symbol} CVD (${exchangeLabel(venue)}), ${buckets.length} buckets`);
      prettyField('Interval', interval ?? '1h');
      prettyField('Notice', typeof notice === 'string' ? notice : undefined);
      if (buckets.length === 0) {
        prettyDim('No trades in this window.');
        return;
      }
      const shown = buckets.slice(0, 20);
      prettyTable(
        ['Bucket (UTC)', 'Buy Volume', 'Sell Volume', 'Delta', 'Cumulative Delta'],
        shown.map((b) => [
          isoTime(field(b, 'timestamp')),
          cell(field(b, 'buyVolume', 'buy_volume')),
          cell(field(b, 'sellVolume', 'sell_volume')),
          cell(field(b, 'delta')),
          cell(field(b, 'cumulativeDelta', 'cumulative_delta')),
        ]),
      );
      printMore(shown.length, buckets.length, page);
      prettyDim('Cumulative delta restarts on every page; rebuild it from delta when joining pages.');
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
