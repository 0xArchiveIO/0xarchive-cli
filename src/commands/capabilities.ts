// `oxa capabilities`: what each venue serves (`GET /v1/capabilities`), one row
// per venue and datatype: the REST routes, the WebSocket channels and whether
// they stream live and replay, the first served instant, cadence, page limit,
// and accepted intervals. The route is public, so an API key is optional.

import { createClient, exchangeLabel, listOr } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseChoice } from '../lib/params.js';
import { getCapabilities, type CapabilityRow } from '../lib/sdk.js';
import { cell, emitDocument } from '../lib/emit.js';

/** The venue names `/v1/capabilities` uses. */
export const CAPABILITY_VENUES = ['hyperliquid', 'hip3', 'hip4', 'spot', 'lighter', 'rh-lighter'] as const;

// Sent when no key is set. The route answers without authentication, and the
// SDK client needs a non-empty key to be constructed.
const ANONYMOUS_KEY = 'anonymous';

interface CapabilitiesOptions {
  exchange?: string;
  datatype?: string;
  apiKey?: string;
  format: string;
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

/** `2026-03-11T01:03:00.000Z` as `2026-03-11 01:03 UTC`; null reads "-". */
function fromDate(value: string | null): string {
  if (!value) return '-';
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? `${match[1]} ${match[2]} UTC` : value;
}

function list(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '-';
}

function printRow(row: CapabilityRow): void {
  prettyHeader(`${exchangeLabel(row.venue)} ${row.datatype}`);
  prettyField('Venue', row.venue);
  prettyField('Datatype', row.datatype);
  prettyField('REST routes', list(row.restRoutes));
  prettyField('WebSocket channels', list(row.wsChannels));
  prettyField('Live', yesNo(row.live));
  prettyField('Replay', yesNo(row.replay));
  prettyField('Available from', fromDate(row.availableFrom));
  prettyField('Cadence', row.cadence);
  prettyField('Page limit', row.pageLimit ?? '-');
  prettyField('Intervals', list(row.intervals));
  // Set only on rows served on one WebSocket endpoint, or included with some
  // plans rather than all (the mempool row).
  if (row.wsEndpoint) prettyField('WebSocket endpoint', row.wsEndpoint);
  if (row.plans) prettyField('Plans', list(row.plans));
  prettyField('Notes', row.notes);
}

function printTable(rows: CapabilityRow[], title: string): void {
  prettyHeader(`${title}, ${rows.length} rows`);
  prettyTable(
    ['Venue', 'Datatype', 'Live', 'Replay', 'Available From', 'Cadence', 'Page Limit', 'WebSocket Channels'],
    rows.map((row) => [
      row.venue,
      row.datatype,
      yesNo(row.live),
      yesNo(row.replay),
      fromDate(row.availableFrom),
      cell(row.cadence),
      row.pageLimit === null ? '-' : String(row.pageLimit),
      list(row.wsChannels),
    ]),
  );
  prettyDim('Narrow to one venue and datatype (--exchange, --datatype) for its routes, intervals, and notes.');
}

export async function capabilitiesCommand(options: CapabilitiesOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = parseChoice(options.exchange, 'exchange', CAPABILITY_VENUES);
  const apiKey = options.apiKey || process.env.OXA_API_KEY || ANONYMOUS_KEY;
  const capabilities = getCapabilities(createClient(apiKey));

  let rows: CapabilityRow[];
  try {
    rows = await capabilities();
  } catch (error) {
    handleError(error, apiKey);
  }

  const inVenue = venue ? rows.filter((row) => row.venue === venue) : rows;
  const matched = options.datatype ? inVenue.filter((row) => row.datatype === options.datatype) : inVenue;
  if (options.datatype && matched.length === 0) {
    const known = [...new Set(inVenue.map((row) => row.datatype))].sort();
    const scope = venue ? `${exchangeLabel(venue)} serves` : 'Datatypes';
    exitError(`No datatype "${options.datatype}". ${scope}: ${listOr(known)}.`, EXIT.VALIDATION);
  }

  emitDocument(matched, { format }, () => {
    if (matched.length === 1) {
      printRow(matched[0]);
      return;
    }
    const title = venue ? `Capabilities (${exchangeLabel(venue)})` : 'Capabilities';
    if (matched.length === 0) {
      prettyHeader(title);
      prettyDim('No rows.');
      return;
    }
    printTable(matched, title);
  });
  process.exit(EXIT.SUCCESS);
}
