// `oxa positioning current --window 1h|4h|24h`: every listed Hyperliquid or
// HIP-3 perp over the current trailing window, with its open-interest change,
// taker buy and sell volume, liquidations, and typical move over windows of
// that length. Current window only, unpaged. Build and above.

import { resolveApiKey, createClient, exchangeLabel, listOr } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { getPositioningResource, hyperliquidVenue } from '../lib/sdk.js';
import { cell, emitPage, field, pickMeta, toPage } from '../lib/emit.js';

/** The trailing windows the route serves. */
export const POSITIONING_WINDOWS = ['1h', '4h', '24h'] as const;

interface PositioningOptions {
  exchange: string;
  window?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

/** `--window`, required: 1h, 4h or 24h. */
function trailingWindow(raw: string | undefined): string {
  if (raw === undefined) {
    exitError(`--window is required: the trailing window, ${listOr(POSITIONING_WINDOWS)}.`, EXIT.VALIDATION);
  }
  if (!(POSITIONING_WINDOWS as readonly string[]).includes(raw)) {
    exitError(`Invalid --window "${raw}". Must be ${listOr(POSITIONING_WINDOWS)}.`, EXIT.VALIDATION);
  }
  return raw;
}

export async function positioningCurrentCommand(options: PositioningOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, 'positioning');
  const window = trailingWindow(options.window);
  const apiKey = resolveApiKey(options.apiKey);

  const client = createClient(apiKey);
  const positioning = getPositioningResource(client, venue);
  try {
    const result = await positioning.current({ window });
    const page = toPage(result);
    // meta.asOf is the 5-minute close the window ends at.
    const meta = pickMeta(result.meta, ['asOf']);
    if (meta) page.meta = meta;
    const records = Array.isArray(page.data) ? page.data : [];

    emitPage(page, { format, out: options.out }, { exchange: venue, window }, () => {
      prettyHeader(`${exchangeLabel(venue)} Positioning, ${window} window (${records.length} markets)`);
      prettyField('As of', field(meta, 'asOf') as string | undefined);
      if (records.length === 0) {
        prettyDim('No listed markets.');
        return;
      }
      const shown = records.slice(0, 20);
      prettyTable(
        ['Symbol', 'OI Start', 'OI End', 'Mark End', 'Buy USD', 'Sell USD', 'Liq Long USD', 'Liq Short USD', 'Typical Price', 'Typical OI', 'Typical Flow'],
        shown.map((r) => [
          cell(field(r, 'symbol')),
          cell(field(r, 'oiStart', 'oi_start') ?? null),
          cell(field(r, 'oiEnd', 'oi_end') ?? null),
          cell(field(r, 'markEnd', 'mark_end') ?? null),
          cell(field(r, 'buyUsd', 'buy_usd')),
          cell(field(r, 'sellUsd', 'sell_usd')),
          cell(field(r, 'liqLongUsd', 'liq_long_usd')),
          cell(field(r, 'liqShortUsd', 'liq_short_usd')),
          cell(field(r, 'typicalPrice', 'typical_price') ?? null),
          cell(field(r, 'typicalOi', 'typical_oi') ?? null),
          cell(field(r, 'typicalFlow', 'typical_flow') ?? null),
        ]),
      );
      if (records.length > shown.length) {
        prettyDim(`... and ${records.length - shown.length} more (sorted by symbol; use JSON output for every market)`);
      }
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
