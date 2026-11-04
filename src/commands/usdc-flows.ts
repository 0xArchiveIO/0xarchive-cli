// `oxa usdc-flows history` and `oxa usdc-flows volume`: USDC entering and
// leaving HyperCore. Arbitrum bridge deposits and withdrawals, and transfers
// to and from HyperEVM (which also carries CCTP). Hyperliquid only; Build and
// above.

import { resolveApiKey, createClient, requireExchange, validateExchange } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp, validateInterval } from '../lib/time.js';
import { parseChoice, parseIntInRange, parseNumberInRange } from '../lib/params.js';
import { getUsdcFlowsResource } from '../lib/sdk.js';
import { cell, emitPage, field, pickMeta, printMore, toPage } from '../lib/emit.js';
import { compact } from '../lib/positions.js';

/** Flow kinds: `deposit`/`withdraw` (Arbitrum bridge), `evm_in`/`evm_out` (HyperEVM). */
export const USDC_FLOW_KINDS = ['deposit', 'withdraw', 'evm_in', 'evm_out'] as const;

const FEATURE = 'USDC flows';
const META_KEYS = ['coverageFrom', 'notice'] as const;

interface WindowOptions {
  exchange: string;
  start?: string;
  end?: string;
  limit?: string;
  cursor?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

interface UsdcFlowsHistoryOptions extends WindowOptions {
  kind?: string;
  minUsd?: string;
}

interface UsdcFlowsVolumeOptions extends WindowOptions {
  interval?: string;
}

/** USDC flows are served for Hyperliquid only. */
function hyperliquidOnly(raw: string): 'hyperliquid' {
  const exchange = validateExchange(raw);
  requireExchange(exchange, ['hyperliquid'] as const, FEATURE);
  return exchange;
}

function timeWindow(options: WindowOptions): { start?: number; end?: number } {
  const start = options.start !== undefined ? parseTimestamp(options.start, 'start') : undefined;
  const end = options.end !== undefined ? parseTimestamp(options.end, 'end') : undefined;
  if (start !== undefined && end !== undefined && start > end) {
    exitError('--start must not be after --end', EXIT.VALIDATION);
  }
  return { start, end };
}

export async function usdcFlowsHistoryCommand(options: UsdcFlowsHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = hyperliquidOnly(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const kind = parseChoice(options.kind, 'kind', USDC_FLOW_KINDS);
  const minUsd = parseNumberInRange(options.minUsd, 'min-usd', 0, 1e12);
  const limit = parseIntInRange(options.limit, 'limit', 1, 1000);
  const { start, end } = timeWindow(options);

  const client = createClient(apiKey);
  const flows = getUsdcFlowsResource(client);
  try {
    const result = await flows.history(compact({ start, end, kind, minUsd, limit, cursor: options.cursor }));
    const page = toPage(result);
    const meta = pickMeta(result.meta, META_KEYS);
    if (meta) page.meta = meta;
    const events = Array.isArray(page.data) ? page.data : [];

    emitPage(page, { format, out: options.out }, { exchange }, () => {
      prettyHeader(`Hyperliquid USDC Flows, ${events.length} events`);
      prettyField('Kind', kind ?? 'all');
      prettyField('Minimum USD', minUsd);
      prettyField('Notice', field(meta, 'notice') as string | undefined);
      if (events.length === 0) {
        prettyDim(
          page.has_more
            ? 'No events on this page; more of the window follows (a page reads at most 31 days).'
            : 'No events in this window.',
        );
        printMore(0, 0, page);
        return;
      }
      const shown = events.slice(0, 20);
      prettyTable(
        ['Time (UTC)', 'Kind', 'Amount USD', 'Fee USD', 'User', 'ID'],
        shown.map((e) => [
          cell(field(e, 'timestamp')),
          cell(field(e, 'kind')),
          cell(field(e, 'amountUsd', 'amount_usd')),
          cell(field(e, 'feeUsd', 'fee_usd')),
          cell(field(e, 'user')),
          cell(field(e, 'id')),
        ]),
      );
      printMore(shown.length, events.length, page);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function usdcFlowsVolumeCommand(options: UsdcFlowsVolumeOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = hyperliquidOnly(options.exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const interval = validateInterval(options.interval);
  const limit = parseIntInRange(options.limit, 'limit', 1, 1000);
  const { start, end } = timeWindow(options);

  const client = createClient(apiKey);
  const flows = getUsdcFlowsResource(client);
  try {
    const result = await flows.volume(compact({ start, end, interval, limit, cursor: options.cursor }));
    const page = toPage(result);
    const meta = pickMeta(result.meta, META_KEYS);
    if (meta) page.meta = meta;
    const buckets = Array.isArray(page.data) ? page.data : [];

    emitPage(page, { format, out: options.out }, { exchange }, () => {
      prettyHeader(`Hyperliquid USDC Flow Volume, ${buckets.length} buckets`);
      prettyField('Interval', interval ?? '1h');
      prettyField('Notice', field(meta, 'notice') as string | undefined);
      if (buckets.length === 0) {
        prettyDim('No buckets in this window.');
        printMore(0, 0, page);
        return;
      }
      const shown = buckets.slice(0, 20);
      prettyTable(
        ['Bucket (UTC)', 'Deposit USD', 'Deposits', 'Withdraw USD', 'Withdrawals', 'EVM In USD', 'EVM Out USD', 'Net USD'],
        shown.map((b) => [
          cell(field(b, 'timestamp')),
          cell(field(b, 'depositUsd', 'deposit_usd')),
          cell(field(b, 'depositCount', 'deposit_count')),
          cell(field(b, 'withdrawUsd', 'withdraw_usd')),
          cell(field(b, 'withdrawCount', 'withdraw_count')),
          cell(field(b, 'evmInUsd', 'evm_in_usd')),
          cell(field(b, 'evmOutUsd', 'evm_out_usd')),
          cell(field(b, 'netUsd', 'net_usd')),
        ]),
      );
      printMore(shown.length, buckets.length, page);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
