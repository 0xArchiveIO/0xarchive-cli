// `oxa breadth current|history`: market breadth above the current UTC-session
// VWAP on Hyperliquid core and HIP-3. `valuePct` is null when no instrument is
// eligible; the CLI keeps it null in JSON and prints "null" in pretty output,
// never 0.

import { resolveApiKey, createClient, exchangeLabel } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp, validateInterval } from '../lib/time.js';
import { parseIntInRange } from '../lib/params.js';
import { getBreadthResource, hyperliquidVenue } from '../lib/sdk.js';
import { cell, emitDocument, emitPage, field, printMore, toPage } from '../lib/emit.js';
import { compact } from '../lib/positions.js';

interface BreadthCurrentOptions {
  exchange: string;
  apiKey?: string;
  format: string;
}

interface BreadthHistoryOptions {
  exchange: string;
  start?: string;
  end?: string;
  interval?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

const FEATURE = 'breadth';

function namespaceCounts(snapshot: unknown, key: string): string | undefined {
  const map = field(field(snapshot, 'namespaces'), key);
  if (!map || typeof map !== 'object') return undefined;
  const entries = Object.entries(map as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  return entries.map(([ns, count]) => `${ns}=${count}`).join(', ');
}

export async function breadthCurrentCommand(options: BreadthCurrentOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, FEATURE);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  const breadth = getBreadthResource(client, venue);
  try {
    const snapshot = await breadth.current();
    emitDocument(snapshot, { format }, () => {
      const counts = field(snapshot, 'counts');
      prettyHeader(`${exchangeLabel(venue)} Breadth Above Session VWAP`);
      prettyField('Session date', field(snapshot, 'sessionDate', 'session_date') as string | undefined);
      prettyField('Calculated at', field(snapshot, 'calculatedAt', 'calculated_at') as string | undefined);
      prettyField('Value %', cell(field(snapshot, 'valuePct', 'value_pct') ?? null));
      prettyField('Coverage ratio', field(snapshot, 'coverageRatio', 'coverage_ratio') as number | undefined);
      prettyField('Candidates', field(counts, 'candidates') as number | undefined);
      prettyField('Eligible', field(counts, 'eligible') as number | undefined);
      prettyField('Above', field(counts, 'above') as number | undefined);
      prettyField('At', field(counts, 'at') as number | undefined);
      prettyField('Below', field(counts, 'below') as number | undefined);
      prettyField(
        'Excluded, no session volume',
        field(counts, 'excludedNoSessionVolume', 'excluded_no_session_volume') as number | undefined,
      );
      prettyField(
        'Excluded, stale price',
        field(counts, 'excludedStalePrice', 'excluded_stale_price') as number | undefined,
      );
      prettyField('Eligible by namespace', namespaceCounts(snapshot, 'eligible'));
      prettyField('Above by namespace', namespaceCounts(snapshot, 'above'));
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function breadthHistoryCommand(options: BreadthHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, FEATURE);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseIntInRange(options.limit, 'limit', 1, 1000);
  const interval = validateInterval(options.interval);
  const start = options.start !== undefined ? parseTimestamp(options.start, 'start') : undefined;
  const end = options.end !== undefined ? parseTimestamp(options.end, 'end') : undefined;
  if (start !== undefined && end !== undefined && start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  const breadth = getBreadthResource(client, venue);
  try {
    const result = await breadth.history(
      compact({ start, end, interval, limit, cursor: options.cursor }),
    );
    const page = toPage(result);
    const records = Array.isArray(page.data) ? page.data : [];
    emitPage(page, { format, out: options.out }, { exchange: venue }, () => {
      prettyHeader(`${exchangeLabel(venue)} Breadth History (${records.length} snapshots)`);
      prettyField('Interval', interval ?? 'every snapshot');
      if (records.length === 0) {
        prettyDim('No breadth snapshots found.');
        return;
      }
      const shown = records.slice(0, 20);
      prettyTable(
        ['Calculated At', 'Value %', 'Coverage', 'Eligible', 'Above', 'At', 'Below'],
        shown.map((s) => {
          const counts = field(s, 'counts');
          return [
            cell(field(s, 'calculatedAt', 'calculated_at')),
            cell(field(s, 'valuePct', 'value_pct') ?? null),
            cell(field(s, 'coverageRatio', 'coverage_ratio')),
            cell(field(counts, 'eligible')),
            cell(field(counts, 'above')),
            cell(field(counts, 'at')),
            cell(field(counts, 'below')),
          ];
        }),
      );
      printMore(shown.length, records.length, page);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
