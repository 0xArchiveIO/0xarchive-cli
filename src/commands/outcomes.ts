import { resolveApiKey, createHip4Client } from '../lib/client.js';
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
import { parseLimit } from '../lib/time.js';

interface OutcomesListOptions {
  settled?: string;
  limit?: string;
  cursor?: string;
  apiKey?: string;
  format: string;
}

interface OutcomesGetOptions {
  outcomeId: string;
  apiKey?: string;
  format: string;
}

function parseSettledFilter(raw: string | undefined): boolean | 'all' {
  if (raw === undefined || raw === 'all') return 'all';
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  exitError(
    `Invalid --settled value "${raw}". Must be "true", "false", or "all".`,
    EXIT.VALIDATION,
  );
}

export async function outcomesListCommand(options: OutcomesListOptions): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const limit = parseLimit(options.limit);
  const settled = parseSettledFilter(options.settled);
  const client = createHip4Client(apiKey);

  try {
    const result = await client.outcomes.list({
      isSettled: settled,
      limit,
      cursor: options.cursor,
    });
    const data = (result.data as any[]) ?? [];
    const envelope = { data, nextCursor: result.nextCursor ?? null };

    if (format === 'pretty') {
      prettyHeader(`HIP-4 Outcomes — ${data.length} markets`);
      if (data.length === 0) {
        prettyDim('No outcome markets found.');
      } else {
        const preview = data.slice(0, 20);
        const rows = preview.map((o: any) => [
          String(o.outcomeId ?? o.outcome_id ?? '—'),
          o.name ?? '—',
          o.status ?? (o.isSettled ? 'settled' : 'live'),
          o.expiry ?? '—',
        ]);
        prettyTable(['Outcome ID', 'Name', 'Status', 'Expiry'], rows);
        if (data.length > 20) prettyDim(`... and ${data.length - 20} more`);
        if (result.nextCursor) prettyDim('More data available (use --cursor to paginate)');
      }
      process.stdout.write('\n');
    } else {
      outputJson(envelope);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function outcomesGetCommand(options: OutcomesGetOptions): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);

  if (!/^\d+$/.test(options.outcomeId)) {
    exitError(
      `Invalid outcome_id "${options.outcomeId}". Must be a non-negative integer.`,
      EXIT.VALIDATION,
    );
  }

  const client = createHip4Client(apiKey);

  try {
    const detail = (await client.outcomes.get(options.outcomeId)) as any;

    if (format === 'pretty') {
      prettyHeader(`HIP-4 Outcome ${options.outcomeId}`);
      prettyField('Name', detail?.name);
      prettyField('Class', detail?.class);
      prettyField('Underlying', detail?.underlying);
      prettyField('Expiry', detail?.expiry);
      prettyField('Target Price', detail?.targetPrice);
      prettyField('Status', detail?.status);
      const oi = detail?.aggregatedOi;
      if (oi) {
        process.stdout.write('\n');
        prettyDim('Aggregated OI');
        prettyField('Side 0 OI (contracts)', oi.side0OpenInterestContracts);
        prettyField('Side 1 OI (contracts)', oi.side1OpenInterestContracts);
        prettyField('Display OI (contracts)', oi.outcomeDisplayOpenInterestContracts);
        prettyField('Paired Set Supply', oi.pairedSetSupplyContracts);
        prettyField('Side Supply Parity', oi.sideSupplyParity);
        prettyField('Currency', oi.currency);
        prettyField('As Of', oi.asOf);
      }
      process.stdout.write('\n');
    } else {
      outputJson(detail);
    }

    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
