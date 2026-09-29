// `oxa wallets classify`: precomputed daily behavioral metrics per active
// wallet on Hyperliquid core or HIP-3, with filters, sorting, and offset paging.
// Parameters reach the API under its own names (min_orders, uses_twap, ...).

import { resolveApiKey, createClient, exchangeLabel } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError, outputJson } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { writeOutputFile } from '../lib/file.js';
import {
  parseBoolean,
  parseChoice,
  parseIntInRange,
  parseNonNegative,
  parseNonNegativeInt,
  parseNumberInRange,
} from '../lib/params.js';
import { getWalletsResource, hyperliquidVenue } from '../lib/sdk.js';
import { cell, field } from '../lib/emit.js';
import { compact, shortAddress } from '../lib/positions.js';

/** Sort keys the classification accepts. */
export const WALLET_SORTS = [
  'total_orders',
  'total_fills',
  'total_volume',
  'total_volume_usd',
  'cancel_rate',
  'fill_rate',
  'maker_ratio',
  'avg_order_size_usd',
  'avg_order_notional',
  'max_order_size_usd',
  'max_order_notional',
  'active_hours',
  'unique_coins',
  'total_fees',
  'total_fees_usd',
  'realized_pnl',
  'realized_pnl_usd',
  'median_cancel_speed_ms',
  'twap_fills',
  'total_priority_gas',
  'total_priority_gas_paid',
  'total_builder_fees',
  'total_builder_fees_paid',
] as const;

interface WalletsClassifyOptions {
  exchange: string;
  minOrders?: string;
  minVolumeUsd?: string;
  sort?: string;
  order?: string;
  limit?: string;
  offset?: string;
  usesTwap?: string;
  usesPriorityGas?: string;
  minCancelRate?: string;
  maxCancelRate?: string;
  date?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

function parseDate(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`));
  if (!ok) exitError(`--date must be a UTC date as YYYY-MM-DD (got ${raw})`, EXIT.VALIDATION);
  return raw;
}

/** Validate the classify flags and map them to the API's parameter names. */
export function classifyParams(options: WalletsClassifyOptions): Record<string, unknown> {
  const minCancelRate = parseNumberInRange(options.minCancelRate, 'min-cancel-rate', 0, 1);
  const maxCancelRate = parseNumberInRange(options.maxCancelRate, 'max-cancel-rate', 0, 1);
  if (minCancelRate !== undefined && maxCancelRate !== undefined && minCancelRate > maxCancelRate) {
    exitError('--min-cancel-rate must not be above --max-cancel-rate', EXIT.VALIDATION);
  }
  return compact({
    min_orders: parseNonNegativeInt(options.minOrders, 'min-orders'),
    min_volume_usd: parseNonNegative(options.minVolumeUsd, 'min-volume-usd'),
    sort: parseChoice(options.sort, 'sort', WALLET_SORTS),
    order: parseChoice(options.order, 'order', ['asc', 'desc'] as const),
    limit: parseIntInRange(options.limit, 'limit', 1, 1000),
    offset: parseIntInRange(options.offset, 'offset', 0, 100_000),
    uses_twap: parseBoolean(options.usesTwap, 'uses-twap'),
    uses_priority_gas: parseBoolean(options.usesPriorityGas, 'uses-priority-gas'),
    min_cancel_rate: minCancelRate,
    max_cancel_rate: maxCancelRate,
    date: parseDate(options.date),
  });
}

export async function walletsClassifyCommand(options: WalletsClassifyOptions): Promise<void> {
  const format = validateFormat(options.format);
  const venue = hyperliquidVenue(options.exchange, 'wallet classification');
  const params = classifyParams(options);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  const resource = getWalletsResource(client, venue);
  try {
    const result = await resource.classify(params);
    const wallets = field(result, 'wallets');
    const rows = Array.isArray(wallets) ? wallets : [];
    const total = field(result, 'total');
    const offset = (params.offset as number | undefined) ?? 0;

    if (options.out) {
      writeOutputFile(options.out, result);
      const summary = {
        written_to: options.out,
        records: rows.length,
        exchange: venue,
        date: field(result, 'date') ?? null,
        total: total ?? null,
        offset,
      };
      if (format === 'pretty') {
        prettyHeader(`Written to ${options.out}`);
        prettyField('Wallets', rows.length);
        prettyField('Matching', total as number | undefined);
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`${exchangeLabel(venue)} Wallet Classification`);
      prettyField('Snapshot date', field(result, 'date') as string | undefined);
      prettyField('Matching wallets', total as number | undefined);
      prettyField('Showing', rows.length ? `${offset + 1} to ${offset + rows.length}` : '0');
      if (rows.length === 0) {
        prettyDim('No wallets match these filters.');
      } else {
        const shown = rows.slice(0, 20);
        prettyTable(
          ['Address', 'Orders', 'Fills', 'Volume USD', 'Maker Ratio', 'Cancel Rate', 'Realized PnL USD'],
          shown.map((w) => {
            const m = field(w, 'metrics');
            const address = field(w, 'address');
            return [
              typeof address === 'string' ? shortAddress(address) : '-',
              cell(field(m, 'totalOrders', 'total_orders')),
              cell(field(m, 'totalFills', 'total_fills')),
              cell(field(m, 'totalVolumeUsd', 'total_volume_usd')),
              cell(field(m, 'makerRatio', 'maker_ratio')),
              cell(field(m, 'cancelRate', 'cancel_rate')),
              cell(field(m, 'realizedPnlUsd', 'realized_pnl_usd')),
            ];
          }),
        );
        if (rows.length > shown.length) prettyDim(`... and ${rows.length - shown.length} more`);
        if (typeof total === 'number' && offset + rows.length < total) {
          prettyDim(`More wallets match (use --offset ${offset + rows.length} to page)`);
        }
      }
      process.stdout.write('\n');
    } else {
      outputJson(result);
    }
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
