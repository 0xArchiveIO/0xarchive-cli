import {
  resolveApiKey,
  validateExchange,
  createClient,
  getExchangeClient,
  type Exchange,
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
import { parseTimestamp, parseLimit, validateInterval } from '../lib/time.js';
import { writeOutputFile } from '../lib/file.js';

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

function validateBreadthExchange(exchange: Exchange): asserts exchange is 'hip3' {
  if (exchange !== 'hip3') {
    exitError(
      'HIP-3 breadth is only available with --exchange hip3.',
      EXIT.VALIDATION,
    );
  }
}

function renderValue(value: number | null): string {
  return value === null ? 'unavailable' : String(value);
}

export async function breadthCurrentCommand(options: BreadthCurrentOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  validateBreadthExchange(exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  try {
    const snapshot = await getExchangeClient(client, exchange).breadth.current();

    if (format === 'pretty') {
      prettyHeader('HIP-3 Breadth (current)');
      prettyField('Session date', snapshot.sessionDate);
      prettyField('Calculated at', snapshot.calculatedAt);
      prettyField('Value %', snapshot.valuePct === null ? 'unavailable' : snapshot.valuePct);
      prettyField('Coverage ratio', snapshot.coverageRatio);
      prettyField('Eligible instruments', snapshot.counts.eligible);
      prettyField('Above VWAP', snapshot.counts.above);
      prettyField('At VWAP', snapshot.counts.at);
      prettyField('Below VWAP', snapshot.counts.below);
      process.stdout.write('\n');
    } else {
      outputJson(snapshot);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function breadthHistoryCommand(options: BreadthHistoryOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = validateExchange(options.exchange);
  validateBreadthExchange(exchange);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  if (limit !== undefined && limit > 1_000) {
    exitError('--limit must be between 1 and 1000 for HIP-3 breadth history', EXIT.VALIDATION);
  }
  const interval = validateInterval(options.interval);
  const start = options.start ? parseTimestamp(options.start, 'start') : undefined;
  const end = options.end ? parseTimestamp(options.end, 'end') : undefined;

  if (start !== undefined && end !== undefined && start >= end) {
    exitError('--start must be before --end', EXIT.VALIDATION);
  }

  const client = createClient(apiKey);

  try {
    const result = await getExchangeClient(client, exchange).breadth.history({
      start,
      end,
      interval,
      limit,
      cursor: options.cursor,
    });
    const records = result.data;
    const envelope = { data: records, nextCursor: result.nextCursor ?? null };

    if (options.out) {
      writeOutputFile(options.out, envelope);
    }

    if (format === 'pretty') {
      prettyHeader(`HIP-3 Breadth History (${records.length} records)`);
      prettyField('Interval', interval ?? 'raw 1m');

      if (records.length === 0) {
        prettyDim('No breadth snapshots found.');
      } else {
        const rows = records.slice(0, 20).map((record) => [
          record.calculatedAt,
          renderValue(record.valuePct),
          String(record.coverageRatio),
          String(record.counts.eligible),
          String(record.counts.above),
          String(record.counts.at),
          String(record.counts.below),
        ]);
        prettyTable(
          ['Calculated At', 'Value %', 'Coverage', 'Eligible', 'Above', 'At', 'Below'],
          rows,
        );

        if (records.length > 20) {
          prettyDim(`... and ${records.length - 20} more`);
        }
        if (result.nextCursor) {
          prettyDim('More data available (use --cursor to paginate)');
        }
      }
      process.stdout.write('\n');
    } else if (options.out) {
      outputJson({
        written_to: options.out,
        records: records.length,
        has_more: !!result.nextCursor,
        nextCursor: result.nextCursor ?? null,
      });
    } else {
      outputJson(envelope);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
