// `oxa positions ...` and `oxa accounts by-l1`: account positions on
// Hyperliquid, HIP-3, and both Lighter deployments (mainnet and Robinhood
// Chain), through the SDK positions resources.
//
// Hyperliquid and HIP-3 are keyed by wallet address (--address 0x...); Lighter
// by integer account index (--account <index>). Every command prints the SDK
// page as a JSON envelope `{ data, nextCursor, has_more, meta }`; `meta` carries the
// snapshot and quality fields (as_of, snapshot_ts, source, quality, stale,
// built_through, finalized_through, totals, notices) whenever the API sends them.

import {
  resolveApiKey,
  validateExchange,
  requireExchange,
  createClient,
  exchangeLabel,
  isLighterExchange,
  listOr,
  sdkTooOld,
} from '../lib/client.js';
import {
  outputJson,
  validateFormat,
  prettyHeader,
  prettyField,
  prettyTable,
  prettyDim,
  EXIT,
  exitError,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseLimit, parseTimestamp } from '../lib/time.js';
import { writeOutputFile } from '../lib/file.js';
import { printNextPage } from '../lib/emit.js';
import {
  ACCOUNT_EXCHANGES,
  POSITIONS_EXCHANGES,
  compact,
  field,
  getLighterAccountsResource,
  getPositionsResource,
  shortAddress,
  text,
  toEnvelope,
  type PageEnvelope,
  type PositionsExchange,
  type PositionsKey,
} from '../lib/positions.js';

const HOUR_MS = 3_600_000;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

interface CommonOptions {
  exchange: string;
  apiKey?: string;
  format: string;
  out?: string;
}

interface KeyOptions extends CommonOptions {
  address?: string;
  account?: string;
}

export interface PositionsGetOptions extends KeyOptions {
  timestamp?: string;
  symbol?: string;
  dex?: string;
  limit?: string;
  cursor?: string;
}

export interface PositionsRangeOptions extends KeyOptions {
  start: string;
  end: string;
  symbol?: string;
  dex?: string;
  limit?: string;
  cursor?: string;
}

export interface PositionsMarketOptions extends CommonOptions {
  symbol: string;
  hour?: string;
  side?: string;
  minValue?: string;
  includeSystem?: boolean;
  limit?: string;
  cursor?: string;
}

export interface PositionsSummaryOptions extends CommonOptions {
  symbol: string;
  start?: string;
  end?: string;
  includeSystem?: boolean;
  limit?: string;
  cursor?: string;
}

export interface PositionsAllOptions extends CommonOptions {
  hour: string;
  includeSystem?: boolean;
  limit?: string;
  cursor?: string;
}

export interface AccountGetOptions extends CommonOptions {
  address: string;
  dex?: string;
}

export interface AccountHistoryOptions extends CommonOptions {
  address: string;
  start: string;
  end: string;
  dex?: string;
  limit?: string;
  cursor?: string;
}

export interface AccountsByL1Options {
  exchange: string;
  l1Address: string;
  limit?: string;
  cursor?: string;
  apiKey?: string;
  format: string;
  out?: string;
}

// ── Validation ──────────────────────────────────────────────────────────

function positionsExchange(raw: string): PositionsExchange {
  const exchange = validateExchange(raw);
  requireExchange(exchange, POSITIONS_EXCHANGES, 'account positions');
  return exchange;
}

function accountExchange(raw: string): PositionsExchange {
  const exchange = validateExchange(raw);
  if (!ACCOUNT_EXCHANGES.includes(exchange as PositionsExchange)) {
    exitError(
      `Account summaries are available for --exchange ${listOr(ACCOUNT_EXCHANGES)}. ` +
        'On Lighter, `oxa positions get --account <index>` returns the account and its positions.',
      EXIT.VALIDATION,
    );
  }
  return exchange as PositionsExchange;
}

function parseAddress(value: string, flag: string): string {
  if (!ADDRESS_RE.test(value)) {
    exitError(`--${flag} must be a 0x-prefixed wallet address with 40 hex characters.`, EXIT.VALIDATION);
  }
  return value;
}

function parseAccountIndex(value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n)) {
    exitError('--account must be a Lighter account index (a non-negative integer).', EXIT.VALIDATION);
  }
  return n;
}

/**
 * Resolve the positions key: a wallet address on Hyperliquid and HIP-3, an
 * integer account index on either Lighter deployment.
 */
export function resolvePositionsKey(exchange: PositionsExchange, options: KeyOptions): PositionsKey {
  if (options.address !== undefined && options.account !== undefined) {
    exitError('Pass either --address or --account, not both.', EXIT.VALIDATION);
  }
  if (isLighterExchange(exchange)) {
    if (options.account === undefined) {
      const lookup =
        exchange === 'lighter'
          ? ' Find the account indices behind an L1 address with `oxa accounts by-l1 --l1-address 0x...`.'
          : '';
      exitError(
        `${exchangeLabel(exchange)} positions are keyed by account index. Pass --account <index>.${lookup}`,
        EXIT.VALIDATION,
      );
    }
    return parseAccountIndex(options.account);
  }
  if (options.address === undefined) {
    exitError(
      `${exchangeLabel(exchange)} positions are keyed by wallet address. Pass --address 0x...`,
      EXIT.VALIDATION,
    );
  }
  return parseAddress(options.address, 'address');
}

function parseDex(exchange: PositionsExchange, dex: string | undefined): string | undefined {
  if (dex === undefined) return undefined;
  if (exchange !== 'hip3') {
    exitError('--dex applies to --exchange hip3 only.', EXIT.VALIDATION);
  }
  return dex;
}

/** `--include-system` is a Lighter filter; `true` or omitted. */
function parseIncludeSystem(exchange: PositionsExchange, includeSystem: boolean | undefined): true | undefined {
  if (!includeSystem) return undefined;
  if (!isLighterExchange(exchange)) {
    exitError('--include-system applies to --exchange lighter and rh-lighter only.', EXIT.VALIDATION);
  }
  return true;
}

function parseRange(startRaw: string, endRaw: string): { start: number; end: number } {
  const start = parseTimestamp(startRaw, 'start');
  const end = parseTimestamp(endRaw, 'end');
  if (start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }
  return { start, end };
}

/** Market and bulk listings read one committed hourly snapshot. */
export function parseHour(raw: string): number {
  const hour = parseTimestamp(raw, 'hour');
  if (hour % HOUR_MS !== 0) {
    exitError(
      '--hour must be an exact UTC hour (for example 2026-09-01T12:00:00Z or its Unix ms value).',
      EXIT.VALIDATION,
    );
  }
  return hour;
}

function parseSide(raw: string | undefined): 'long' | 'short' | undefined {
  if (raw === undefined) return undefined;
  const side = raw.toLowerCase();
  if (side !== 'long' && side !== 'short') {
    exitError('--side must be long or short.', EXIT.VALIDATION);
  }
  return side;
}

function parseMinValue(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n) || n < 0) {
    exitError('--min-value must be a non-negative number (USD).', EXIT.VALIDATION);
  }
  return n;
}

// ── Output ──────────────────────────────────────────────────────────────

function rows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}

/** Records in a page: the rows, or a wallet response's positions. */
function recordCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  const positions = field(data, 'positions');
  if (Array.isArray(positions)) return positions.length;
  const accounts = field(data, 'accounts');
  if (Array.isArray(accounts)) return accounts.length;
  return data === null || data === undefined ? 0 : 1;
}

function printMeta(meta: Record<string, unknown> | undefined): void {
  if (!meta) return;
  prettyField('As of', field(meta, 'asOf', 'as_of') as string | undefined);
  prettyField('Snapshot', field(meta, 'snapshotTs', 'snapshot_ts') as string | undefined);
  prettyField('Source', field(meta, 'source') as string | undefined);
  prettyField('Quality', field(meta, 'quality') as string | undefined);
  if (field(meta, 'stale') === true) prettyField('Stale', 'yes');
  prettyField('Built through', field(meta, 'builtThrough', 'built_through') as string | undefined);
  prettyField('Finalized through', field(meta, 'finalizedThrough', 'finalized_through') as string | undefined);
  prettyField('Clamped to', field(meta, 'clampedTo', 'clamped_to') as string | undefined);
  prettyField('Coverage from', field(meta, 'coverageFrom', 'coverage_from') as string | undefined);
  prettyField('Notice', field(meta, 'notice') as string | undefined);
}

function printMore(page: PageEnvelope, shown: number, total: number): void {
  if (total > shown) prettyDim(`... and ${total - shown} more`);
  printNextPage(page);
}

/**
 * Emit one page: JSON envelope on stdout, or a file plus a short summary with
 * --out, or the pretty renderer.
 */
function emit(
  page: PageEnvelope,
  options: { format: string; out?: string },
  context: Record<string, unknown>,
  pretty: () => void,
): void {
  if (options.out) {
    writeOutputFile(options.out, page);
    const summary = {
      written_to: options.out,
      records: recordCount(page.data),
      ...context,
      has_more: page.has_more,
      nextCursor: page.nextCursor,
    };
    if (options.format === 'pretty') {
      prettyHeader(`Written to ${options.out}`);
      prettyField('Records', summary.records);
      prettyField('Has more', summary.has_more ? 'yes' : 'no');
      process.stdout.write('\n');
    } else {
      outputJson(summary);
    }
    return;
  }
  if (options.format === 'pretty') {
    pretty();
    process.stdout.write('\n');
    return;
  }
  outputJson(page);
}

function keyLabel(key: PositionsKey): string {
  return typeof key === 'number' ? `account ${key}` : shortAddress(key);
}

function positionRow(p: unknown): string[] {
  return [
    text(field(p, 'symbol', 'coin')),
    text(field(p, 'side')),
    text(field(p, 'size')),
    text(field(p, 'entryPrice', 'entry_price')),
    text(field(p, 'markPrice', 'mark_price')),
    text(field(p, 'positionValue', 'position_value')),
    text(field(p, 'unrealizedPnl', 'unrealized_pnl')),
    text(field(p, 'liquidationPrice', 'liquidation_price')),
  ];
}

const POSITION_HEADERS = ['Symbol', 'Side', 'Size', 'Entry', 'Mark', 'Value', 'uPnL', 'Liq. price'];

function printAccount(account: unknown): void {
  if (account === null || account === undefined) return;
  prettyField('Account value', field(account, 'accountValue', 'account_value') as string | undefined);
  prettyField('Total position value', field(account, 'totalPositionValue', 'total_position_value') as string | undefined);
  prettyField('Unrealized PnL', field(account, 'totalUnrealizedPnl', 'total_unrealized_pnl') as string | undefined);
  prettyField('Margin used', field(account, 'totalMarginUsed', 'total_margin_used') as string | undefined);
  prettyField('Open positions', field(account, 'nPositions', 'n_positions') as number | undefined);
}

// ── oxa positions get ───────────────────────────────────────────────────

export async function positionsGetCommand(options: PositionsGetOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = positionsExchange(options.exchange);
  const key = resolvePositionsKey(exchange, options);
  const dex = parseDex(exchange, options.dex);
  const timestamp = options.timestamp !== undefined ? parseTimestamp(options.timestamp, 'timestamp') : undefined;
  const limit = parseLimit(options.limit);
  const apiKey = resolveApiKey(options.apiKey);
  const resource = getPositionsResource(createClient(apiKey), exchange);

  try {
    const result = await resource.get(
      key,
      compact({ timestamp, symbol: options.symbol, dex, cursor: options.cursor, limit }),
    );
    const page = toEnvelope(result);
    emit(page, { format, out: options.out }, { exchange }, () => {
      const positions = rows(field(page.data, 'positions') ?? page.data);
      prettyHeader(`Positions for ${keyLabel(key)} (${exchangeLabel(exchange)}): ${positions.length} open`);
      printMeta(page.meta);
      prettyField('Account seen', field(page.data, 'accountSeen', 'account_seen') as string | undefined);
      printAccount(field(page.data, 'account'));
      if (positions.length === 0) {
        prettyDim('No open positions.');
      } else {
        process.stdout.write('\n');
        prettyTable(POSITION_HEADERS, positions.slice(0, 50).map(positionRow));
        printMore(page, Math.min(positions.length, 50), positions.length);
      }
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa positions history / changes ─────────────────────────────────────

async function rangeCommand(options: PositionsRangeOptions, kind: 'history' | 'changes'): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = positionsExchange(options.exchange);
  const key = resolvePositionsKey(exchange, options);
  const dex = parseDex(exchange, options.dex);
  const { start, end } = parseRange(options.start, options.end);
  const limit = parseLimit(options.limit);
  const apiKey = resolveApiKey(options.apiKey);
  const resource = getPositionsResource(createClient(apiKey), exchange);

  try {
    const params = compact({ start, end, symbol: options.symbol, dex, cursor: options.cursor, limit });
    const result = kind === 'history' ? await resource.history(key, params) : await resource.changes(key, params);
    const page = toEnvelope(result);
    emit(page, { format, out: options.out }, { exchange }, () => {
      const data = rows(page.data);
      const title = kind === 'history' ? 'Hourly positions' : 'Position changes';
      prettyHeader(`${title} for ${keyLabel(key)} (${exchangeLabel(exchange)}): ${data.length} records`);
      printMeta(page.meta);
      if (data.length === 0) {
        prettyDim('No records in this window.');
        return;
      }
      process.stdout.write('\n');
      const preview = data.slice(0, 20);
      if (kind === 'history') {
        prettyTable(
          ['Snapshot', 'Symbol', 'Side', 'Size', 'Entry', 'Value', 'uPnL'],
          preview.map((p) => [
            text(field(p, 'snapshotTs', 'snapshot_ts')),
            text(field(p, 'symbol', 'coin')),
            text(field(p, 'side')),
            text(field(p, 'size')),
            text(field(p, 'entryPrice', 'entry_price')),
            text(field(p, 'positionValue', 'position_value')),
            text(field(p, 'unrealizedPnl', 'unrealized_pnl')),
          ]),
        );
      } else {
        prettyTable(
          ['Timestamp', 'Symbol', 'Event', 'Side', 'Price', 'Size', 'Before', 'After'],
          preview.map((c) => [
            text(field(c, 'timestamp')),
            text(field(c, 'symbol', 'coin')),
            text(field(c, 'eventType', 'event_type')),
            text(field(c, 'side')),
            text(field(c, 'price')),
            text(field(c, 'size')),
            text(field(c, 'startPosition', 'start_position')),
            text(field(c, 'endPosition', 'end_position')),
          ]),
        );
      }
      printMore(page, preview.length, data.length);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function positionsHistoryCommand(options: PositionsRangeOptions): Promise<void> {
  return rangeCommand(options, 'history');
}

export async function positionsChangesCommand(options: PositionsRangeOptions): Promise<void> {
  return rangeCommand(options, 'changes');
}

// ── oxa positions market ────────────────────────────────────────────────

export async function positionsMarketCommand(options: PositionsMarketOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = positionsExchange(options.exchange);
  const includeSystem = parseIncludeSystem(exchange, options.includeSystem);
  const hour = options.hour !== undefined ? parseHour(options.hour) : undefined;
  const side = parseSide(options.side);
  const minValue = parseMinValue(options.minValue);
  const limit = parseLimit(options.limit);
  const apiKey = resolveApiKey(options.apiKey);
  const resource = getPositionsResource(createClient(apiKey), exchange);

  try {
    const result = await resource.market(
      options.symbol,
      compact({
        hour,
        side,
        minValue,
        includeSystem,
        cursor: options.cursor,
        limit,
      }),
    );
    const page = toEnvelope(result);
    emit(page, { format, out: options.out }, { exchange, symbol: options.symbol }, () => {
      const data = rows(page.data);
      prettyHeader(`${options.symbol} open positions (${exchangeLabel(exchange)}): ${data.length} on this page`);
      printMeta(page.meta);
      const totals = field(page.meta, 'totals');
      if (totals) {
        prettyField(
          'Longs',
          `${text(field(totals, 'longCount', 'long_count'))} (value ${text(field(totals, 'longValue', 'long_value'))})`,
        );
        prettyField(
          'Shorts',
          `${text(field(totals, 'shortCount', 'short_count'))} (value ${text(field(totals, 'shortValue', 'short_value'))})`,
        );
      }
      if (data.length === 0) {
        prettyDim('No open positions match.');
        return;
      }
      process.stdout.write('\n');
      const preview = data.slice(0, 20);
      prettyTable(
        ['Holder', 'Side', 'Size', 'Entry', 'Value', 'uPnL', 'Liq. price'],
        preview.map((p) => [
          shortAddress(text(field(p, 'userAddress', 'user_address', 'accountIndex', 'account_index'))),
          text(field(p, 'side')),
          text(field(p, 'size')),
          text(field(p, 'entryPrice', 'entry_price')),
          text(field(p, 'positionValue', 'position_value')),
          text(field(p, 'unrealizedPnl', 'unrealized_pnl')),
          text(field(p, 'liquidationPrice', 'liquidation_price')),
        ]),
      );
      printMore(page, preview.length, data.length);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa positions summary ───────────────────────────────────────────────

export async function positionsSummaryCommand(options: PositionsSummaryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = positionsExchange(options.exchange);
  if ((options.start === undefined) !== (options.end === undefined)) {
    exitError(
      'Pass both --start and --end for an hourly series, or neither for the latest snapshot.',
      EXIT.VALIDATION,
    );
  }
  const range = options.start !== undefined ? parseRange(options.start, options.end!) : undefined;
  if (options.cursor !== undefined && range === undefined) {
    // Only an hourly series pages, and its cursor is bound to the window it
    // was issued for.
    exitError(
      '--cursor pages an hourly series: pass the same --start and --end as the first page.',
      EXIT.VALIDATION,
    );
  }
  const includeSystem = parseIncludeSystem(exchange, options.includeSystem);
  const limit = parseLimit(options.limit);
  const apiKey = resolveApiKey(options.apiKey);
  const resource = getPositionsResource(createClient(apiKey), exchange);

  try {
    const result = await resource.marketSummary(
      options.symbol,
      compact({ start: range?.start, end: range?.end, includeSystem, cursor: options.cursor, limit }),
    );
    const page = toEnvelope(result);
    emit(page, { format, out: options.out }, { exchange, symbol: options.symbol }, () => {
      const data = rows(page.data);
      prettyHeader(`${options.symbol} positioning summary (${exchangeLabel(exchange)}): ${data.length} snapshots`);
      printMeta(page.meta);
      if (data.length === 0) {
        prettyDim('No snapshots in this window.');
        return;
      }
      process.stdout.write('\n');
      const preview = data.slice(-24);
      prettyTable(
        ['Snapshot', 'Longs', 'Shorts', 'Long value', 'Short value', 'Top-10 share'],
        preview.map((s) => [
          text(field(s, 'snapshotTs', 'snapshot_ts')),
          text(field(s, 'longCount', 'long_count')),
          text(field(s, 'shortCount', 'short_count')),
          text(field(s, 'longValue', 'long_value')),
          text(field(s, 'shortValue', 'short_value')),
          text(field(s, 'top10ValueShare', 'top10_value_share')),
        ]),
      );
      if (data.length > preview.length) prettyDim(`Showing the latest ${preview.length} of ${data.length}.`);
      printNextPage(page);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa positions all ───────────────────────────────────────────────────

export async function positionsAllCommand(options: PositionsAllOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = positionsExchange(options.exchange);
  const hour = parseHour(options.hour);
  const includeSystem = parseIncludeSystem(exchange, options.includeSystem);
  const limit = parseLimit(options.limit);
  const apiKey = resolveApiKey(options.apiKey);
  const resource = getPositionsResource(createClient(apiKey), exchange);

  try {
    const result = await resource.all(
      compact({ hour, includeSystem, cursor: options.cursor, limit }),
    );
    const page = toEnvelope(result);
    emit(page, { format, out: options.out }, { exchange }, () => {
      const data = rows(page.data);
      prettyHeader(`All open positions (${exchangeLabel(exchange)}): ${data.length} on this page`);
      printMeta(page.meta);
      if (data.length === 0) {
        prettyDim('No positions in this snapshot.');
        return;
      }
      process.stdout.write('\n');
      const preview = data.slice(0, 20);
      prettyTable(
        ['Symbol', 'Holder', 'Side', 'Size', 'Value'],
        preview.map((p) => [
          text(field(p, 'symbol', 'coin')),
          shortAddress(text(field(p, 'userAddress', 'user_address', 'accountIndex', 'account_index'))),
          text(field(p, 'side')),
          text(field(p, 'size')),
          text(field(p, 'positionValue', 'position_value')),
        ]),
      );
      printMore(page, preview.length, data.length);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa positions account / account-history (Hyperliquid, HIP-3) ────────

export async function accountGetCommand(options: AccountGetOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = accountExchange(options.exchange);
  const address = parseAddress(options.address, 'address');
  const dex = parseDex(exchange, options.dex);
  const apiKey = resolveApiKey(options.apiKey);
  const resource = getPositionsResource(createClient(apiKey), exchange);
  const account = resource.account?.bind(resource);
  if (!account) sdkTooOld(`${exchangeLabel(exchange)} account summaries`);

  try {
    const result = await account(address, compact({ dex }));
    const page = toEnvelope(result);
    emit(page, { format, out: options.out }, { exchange }, () => {
      prettyHeader(`Account ${shortAddress(address)} (${exchangeLabel(exchange)})`);
      printMeta(page.meta);
      const accounts = Array.isArray(page.data) ? page.data : [page.data];
      for (const account of accounts) {
        const accountDex = field(account, 'dex');
        if (accountDex) prettyField('Dex', accountDex as string);
        printAccount(account);
        prettyField('Quality', field(account, 'quality') as string | undefined);
      }
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function accountHistoryCommand(options: AccountHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = accountExchange(options.exchange);
  const address = parseAddress(options.address, 'address');
  const dex = parseDex(exchange, options.dex);
  const { start, end } = parseRange(options.start, options.end);
  const limit = parseLimit(options.limit);
  const apiKey = resolveApiKey(options.apiKey);
  const resource = getPositionsResource(createClient(apiKey), exchange);
  const accountHistory = resource.accountHistory?.bind(resource);
  if (!accountHistory) sdkTooOld(`${exchangeLabel(exchange)} account history`);

  try {
    const result = await accountHistory(
      address,
      compact({ start, end, dex, cursor: options.cursor, limit }),
    );
    const page = toEnvelope(result);
    emit(page, { format, out: options.out }, { exchange }, () => {
      const data = rows(page.data);
      prettyHeader(`Account history for ${shortAddress(address)} (${exchangeLabel(exchange)}): ${data.length} records`);
      printMeta(page.meta);
      if (data.length === 0) {
        prettyDim('No account snapshots in this window.');
        return;
      }
      process.stdout.write('\n');
      const preview = data.slice(0, 20);
      prettyTable(
        ['Snapshot', 'Account value', 'Position value', 'uPnL', 'Positions'],
        preview.map((a) => [
          text(field(a, 'snapshotTs', 'snapshot_ts')),
          text(field(a, 'accountValue', 'account_value')),
          text(field(a, 'totalPositionValue', 'total_position_value')),
          text(field(a, 'totalUnrealizedPnl', 'total_unrealized_pnl')),
          text(field(a, 'nPositions', 'n_positions')),
        ]),
      );
      printMore(page, preview.length, data.length);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

// ── oxa accounts by-l1 (Lighter mainnet) ────────────────────────────────

export async function accountsByL1Command(options: AccountsByL1Options): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  if (exchange !== 'lighter') {
    exitError(
      'Account lookup by L1 address is available for Lighter mainnet only (--exchange lighter).',
      EXIT.VALIDATION,
    );
  }
  const l1Address = parseAddress(options.l1Address, 'l1-address');
  const limit = parseLimit(options.limit);
  const apiKey = resolveApiKey(options.apiKey);
  const accountsResource = getLighterAccountsResource(createClient(apiKey));

  try {
    const result = await accountsResource.byL1(
      l1Address,
      compact({ cursor: options.cursor, limit }),
    );
    const page = toEnvelope(result);
    emit(page, { format, out: options.out }, { exchange }, () => {
      const accounts = rows(field(page.data, 'accounts') ?? page.data);
      prettyHeader(`Lighter accounts for ${shortAddress(l1Address)}`);
      prettyField('Total accounts', field(page.data, 'totalAccounts', 'total_accounts') as number | undefined);
      if (accounts.length === 0) {
        prettyDim('No Lighter accounts found for this address.');
        return;
      }
      process.stdout.write('\n');
      prettyTable(
        ['Account index', 'Type', 'First seen'],
        accounts.map((a) => [
          text(field(a, 'accountIndex', 'account_index')),
          text(field(a, 'accountType', 'account_type')),
          text(field(a, 'firstSeen', 'first_seen')),
        ]),
      );
      printNextPage(page);
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
