// `oxa breadth above-ma current|history --n <5|20|50|200>`: the share of
// Hyperliquid or HIP-3 perps trading above their n-day moving average, with the
// quartiles of how far above or below. Build and above. `oxa breadth current`
// and `oxa breadth history` stay breadth above the UTC-session VWAP.

import { resolveApiKey, createClient, exchangeLabel, listOr } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp, validateInterval } from '../lib/time.js';
import { parseIntInRange } from '../lib/params.js';
import { getBreadthMaResource, hyperliquidVenue } from '../lib/sdk.js';
import { cell, emitDocument, emitPage, field, pickMeta, printMore, toPage } from '../lib/emit.js';
import { compact } from '../lib/positions.js';

/** The moving-average lengths, in days. */
export const BREADTH_MA_LENGTHS = ['5', '20', '50', '200'] as const;

const FEATURE = 'moving-average breadth';
const META_KEYS = ['coverageFrom', 'notice'] as const;

interface BreadthMaCurrentOptions {
  exchange: string;
  n?: string;
  apiKey?: string;
  format: string;
}

interface BreadthMaHistoryOptions extends BreadthMaCurrentOptions {
  start?: string;
  end?: string;
  interval?: string;
  limit?: string;
  cursor?: string;
  out?: string;
}

/** `--n`, required: 5, 20, 50 or 200. */
function length(raw: string | undefined): number {
  if (raw === undefined) {
    exitError(`--n is required: the moving average's length in days, ${listOr(BREADTH_MA_LENGTHS)}.`, EXIT.VALIDATION);
  }
  if (!(BREADTH_MA_LENGTHS as readonly string[]).includes(raw)) {
    exitError(`Invalid --n "${raw}". Must be ${listOr(BREADTH_MA_LENGTHS)}.`, EXIT.VALIDATION);
  }
  return Number(raw);
}

export async function breadthMaCurrentCommand(options: BreadthMaCurrentOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, FEATURE);
  const n = length(options.n);
  const apiKey = resolveApiKey(options.apiKey);

  const client = createClient(apiKey);
  const breadthMa = getBreadthMaResource(client, venue);
  try {
    const reading = await breadthMa.current({ n });
    emitDocument(reading, { format }, () => {
      const counts = field(reading, 'counts');
      const distance = field(reading, 'distance');
      prettyHeader(`${exchangeLabel(venue)} Breadth Above the ${n}-Day Moving Average`);
      prettyField('Calculated at', field(reading, 'calculatedAt', 'calculated_at') as string | undefined);
      prettyField('Value %', cell(field(reading, 'valuePct', 'value_pct') ?? null));
      prettyField('Coverage ratio', field(reading, 'coverageRatio', 'coverage_ratio') as number | undefined);
      prettyField('Candidates', field(counts, 'candidates') as number | undefined);
      prettyField('Eligible', field(counts, 'eligible') as number | undefined);
      prettyField('Above', field(counts, 'above') as number | undefined);
      prettyField('At', field(counts, 'at') as number | undefined);
      prettyField('Below', field(counts, 'below') as number | undefined);
      prettyField('Excluded, stale price', field(counts, 'excludedStalePrice', 'excluded_stale_price') as number | undefined);
      prettyField(
        'Excluded, short history',
        field(counts, 'excludedShortHistory', 'excluded_short_history') as number | undefined,
      );
      prettyField('Distance p25', cell(field(distance, 'p25') ?? null));
      prettyField('Distance median', cell(field(distance, 'median') ?? null));
      prettyField('Distance p75', cell(field(distance, 'p75') ?? null));
      prettyField('Method', field(reading, 'method') as string | undefined);
      prettyField('Final', field(reading, 'isFinal', 'is_final') === true ? 'yes' : 'no');
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function breadthMaHistoryCommand(options: BreadthMaHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, FEATURE);
  const n = length(options.n);
  const apiKey = resolveApiKey(options.apiKey);
  const interval = validateInterval(options.interval);
  const limit = parseIntInRange(options.limit, 'limit', 1, 1000);
  const start = options.start !== undefined ? parseTimestamp(options.start, 'start') : undefined;
  const end = options.end !== undefined ? parseTimestamp(options.end, 'end') : undefined;
  if (start !== undefined && end !== undefined && start > end) {
    exitError('--start must not be after --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);
  const breadthMa = getBreadthMaResource(client, venue);
  try {
    const result = await breadthMa.history(compact({ n, start, end, interval, limit, cursor: options.cursor }));
    const page = toPage(result);
    const meta = pickMeta(result.meta, META_KEYS);
    if (meta) page.meta = meta;
    const readings = Array.isArray(page.data) ? page.data : [];

    emitPage(page, { format, out: options.out }, { exchange: venue, n }, () => {
      prettyHeader(`${exchangeLabel(venue)} Breadth Above the ${n}-Day Moving Average (${readings.length} buckets)`);
      prettyField('Interval', interval ?? '1m');
      prettyField('Notice', field(meta, 'notice') as string | undefined);
      if (readings.length === 0) {
        prettyDim('No readings in this window.');
        printMore(0, 0, page);
        return;
      }
      const shown = readings.slice(0, 20);
      prettyTable(
        ['Bucket (UTC)', 'Calculated At', 'Value %', 'Coverage', 'Eligible', 'Above', 'Below', 'Median Distance', 'Final'],
        shown.map((r) => {
          const counts = field(r, 'counts');
          return [
            cell(field(r, 'timestamp')),
            cell(field(r, 'calculatedAt', 'calculated_at')),
            cell(field(r, 'valuePct', 'value_pct') ?? null),
            cell(field(r, 'coverageRatio', 'coverage_ratio')),
            cell(field(counts, 'eligible')),
            cell(field(counts, 'above')),
            cell(field(counts, 'below')),
            cell(field(field(r, 'distance'), 'median') ?? null),
            field(r, 'isFinal', 'is_final') === true ? 'yes' : 'no',
          ];
        }),
      );
      printMore(shown.length, readings.length, page);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
