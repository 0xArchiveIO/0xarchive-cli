// `oxa data-quality ...`: platform status, coverage (overall, per venue, or
// per symbol with gaps and cadence), incidents, latency, SLA compliance, and
// the freshness of the account positions data, through the SDK's dataQuality
// resource.

import { resolveApiKey, createClient, sdkTooOld } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, prettyTable, prettyDim, EXIT, exitError } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseTimestamp } from '../lib/time.js';
import { parseChoice, parseIntInRange, parseNonNegativeInt } from '../lib/params.js';
import { getDataQualityResource, type DataQualityResource } from '../lib/sdk.js';
import { cell, emitDocument, field } from '../lib/emit.js';
import { compact } from '../lib/positions.js';
import { SYMBOL_EXCHANGES } from './symbols.js';

interface BaseOptions {
  apiKey?: string;
  format: string;
}

export const INCIDENT_STATUSES = ['open', 'investigating', 'identified', 'monitoring', 'resolved'] as const;

/** Run one data-quality call, mapping failures to exit codes. */
async function withDataQuality(
  options: BaseOptions,
  run: (dataQuality: DataQualityResource) => Promise<void>,
  requires?: { method: keyof DataQualityResource; feature: string },
): Promise<void> {
  const apiKey = resolveApiKey(options.apiKey);
  const dataQuality = getDataQualityResource(createClient(apiKey), requires?.feature);
  if (requires && typeof dataQuality[requires.method] !== 'function') sdkTooOld(requires.feature);
  try {
    await run(dataQuality);
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

function entries(record: unknown): Array<[string, unknown]> {
  return record && typeof record === 'object' ? Object.entries(record as Record<string, unknown>) : [];
}

function coverageRows(exchange: string, dataTypes: unknown): string[][] {
  return entries(dataTypes).map(([dataType, c]) => [
    exchange,
    dataType,
    cell(field(c, 'earliest')),
    cell(field(c, 'latest')),
    cell(field(c, 'totalRecords', 'total_records')),
    cell(field(c, 'symbols')),
    cell(field(c, 'completeness')),
  ]);
}

const COVERAGE_HEADERS = ['Exchange', 'Data Type', 'Earliest', 'Latest', 'Records', 'Symbols', 'Completeness %'];

// ── status ──────────────────────────────────────────────────────────────

export async function dataQualityStatusCommand(options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  await withDataQuality(options, async (dq) => {
    const status = await dq.status();
    emitDocument(status, { format }, () => {
      prettyHeader(`Data Quality Status: ${cell(field(status, 'status'))}`);
      prettyField('Updated at', field(status, 'updatedAt', 'updated_at') as string | undefined);
      prettyField('Active incidents', cell(field(status, 'activeIncidents', 'active_incidents') ?? 0));
      const venues = entries(field(status, 'exchanges'));
      if (venues.length) {
        prettyTable(
          ['Exchange', 'Status', 'Last Data', 'Latency ms'],
          venues.map(([name, v]) => [
            name,
            cell(field(v, 'status')),
            cell(field(v, 'lastDataAt', 'last_data_at')),
            cell(field(v, 'latencyMs', 'latency_ms')),
          ]),
        );
      }
      const types = entries(field(status, 'dataTypes', 'data_types'));
      if (types.length) {
        process.stdout.write('\n');
        prettyTable(
          ['Data Type', 'Status', 'Completeness 24h %'],
          types.map(([name, t]) => [
            name,
            cell(field(t, 'status')),
            cell(field(t, 'completeness24h', 'completeness_24h')),
          ]),
        );
      }
    });
  });
}

// ── coverage ────────────────────────────────────────────────────────────

interface CoverageOptions extends BaseOptions {
  exchange?: string;
  symbol?: string;
  from?: string;
  to?: string;
}

export async function dataQualityCoverageCommand(options: CoverageOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = parseChoice(options.exchange, 'exchange', SYMBOL_EXCHANGES);
  if (options.symbol !== undefined && exchange === undefined) {
    exitError('--symbol needs --exchange: symbols are named per venue (e.g. --exchange hip3 --symbol km:US500).', EXIT.VALIDATION);
  }
  if ((options.from !== undefined || options.to !== undefined) && options.symbol === undefined) {
    exitError('--from and --to bound the gap search of one symbol; pass them with --exchange and --symbol.', EXIT.VALIDATION);
  }
  const from = options.from !== undefined ? parseTimestamp(options.from, 'from') : undefined;
  const to = options.to !== undefined ? parseTimestamp(options.to, 'to') : undefined;
  if (from !== undefined && to !== undefined && from >= to) {
    exitError('--from must be before --to', EXIT.VALIDATION);
  }

  await withDataQuality(options, async (dq) => {
    if (exchange !== undefined && options.symbol !== undefined) {
      const symbol = options.symbol;
      const bounds = compact({ from, to });
      const coverage = await dq.symbolCoverage(exchange, symbol, Object.keys(bounds).length ? bounds : undefined);
      emitDocument(coverage, { format }, () => {
        prettyHeader(`${symbol} Coverage (${exchange})`);
        const types = entries(field(coverage, 'dataTypes', 'data_types'));
        if (types.length === 0) {
          prettyDim('No coverage reported for this symbol.');
          return;
        }
        prettyTable(
          ['Data Type', 'Earliest', 'Latest', 'Records', 'Completeness %', 'Historical %', 'Gaps', 'Median Interval s'],
          types.map(([name, c]) => {
            const gaps = field(c, 'gaps');
            return [
              name,
              cell(field(c, 'earliest')),
              cell(field(c, 'latest')),
              cell(field(c, 'totalRecords', 'total_records')),
              cell(field(c, 'completeness')),
              cell(field(c, 'historicalCoverage', 'historical_coverage')),
              Array.isArray(gaps) ? String(gaps.length) : '-',
              cell(field(field(c, 'cadence'), 'medianIntervalSeconds', 'median_interval_seconds')),
            ];
          }),
        );
        prettyDim('Gaps are searched over the last 30 days unless --from and --to say otherwise; --format json lists them.');
      });
      return;
    }
    if (exchange !== undefined) {
      const coverage = await dq.exchangeCoverage(exchange);
      emitDocument(coverage, { format }, () => {
        prettyHeader(`Coverage (${exchange})`);
        prettyTable(COVERAGE_HEADERS, coverageRows(exchange, field(coverage, 'dataTypes', 'data_types')));
      });
      return;
    }
    const coverage = await dq.coverage();
    emitDocument(coverage, { format }, () => {
      prettyHeader('Coverage');
      const venues = field(coverage, 'exchanges');
      const rows = (Array.isArray(venues) ? venues : []).flatMap((v) =>
        coverageRows(cell(field(v, 'exchange')), field(v, 'dataTypes', 'data_types')),
      );
      prettyTable(COVERAGE_HEADERS, rows);
    });
  });
}

// ── incidents ───────────────────────────────────────────────────────────

interface IncidentsOptions extends BaseOptions {
  status?: string;
  exchange?: string;
  since?: string;
  limit?: string;
  offset?: string;
}

function printIncident(incident: unknown): void {
  const dataTypes = field(incident, 'dataTypes', 'data_types');
  const symbols = field(incident, 'symbolsAffected', 'symbols_affected');
  prettyField('Title', field(incident, 'title') as string | undefined);
  prettyField('Status', field(incident, 'status') as string | undefined);
  prettyField('Severity', field(incident, 'severity') as string | undefined);
  prettyField('Exchange', field(incident, 'exchange') as string | undefined);
  prettyField('Data types', Array.isArray(dataTypes) ? dataTypes.join(', ') : undefined);
  prettyField('Symbols affected', Array.isArray(symbols) ? symbols.join(', ') : undefined);
  prettyField('Started', field(incident, 'startedAt', 'started_at') as string | undefined);
  prettyField('Resolved', field(incident, 'resolvedAt', 'resolved_at') as string | undefined);
  prettyField('Duration minutes', field(incident, 'durationMinutes', 'duration_minutes') as number | undefined);
  prettyField('Records affected', field(incident, 'recordsAffected', 'records_affected') as number | undefined);
  prettyField('Records recovered', field(incident, 'recordsRecovered', 'records_recovered') as number | undefined);
  prettyField('Root cause', field(incident, 'rootCause', 'root_cause') as string | undefined);
  prettyField('Resolution', field(incident, 'resolution') as string | undefined);
  prettyField('Description', field(incident, 'description') as string | undefined);
}

export async function dataQualityIncidentsCommand(options: IncidentsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const params = compact({
    status: parseChoice(options.status, 'status', INCIDENT_STATUSES),
    exchange: parseChoice(options.exchange, 'exchange', SYMBOL_EXCHANGES),
    since: options.since !== undefined ? parseTimestamp(options.since, 'since') : undefined,
    limit: parseIntInRange(options.limit, 'limit', 1, 100),
    offset: parseNonNegativeInt(options.offset, 'offset'),
  });

  await withDataQuality(options, async (dq) => {
    const result = await dq.listIncidents(Object.keys(params).length ? params : undefined);
    emitDocument(result, { format }, () => {
      const incidents = field(result, 'incidents');
      const rows = Array.isArray(incidents) ? incidents : [];
      const pagination = field(result, 'pagination');
      const total = field(pagination, 'total');
      const offset = Number(field(pagination, 'offset') ?? 0);
      prettyHeader(`Data Quality Incidents, ${rows.length}${typeof total === 'number' ? ` of ${total}` : ''}`);
      if (rows.length === 0) {
        prettyDim('No incidents match.');
        return;
      }
      prettyTable(
        ['ID', 'Status', 'Severity', 'Exchange', 'Started', 'Resolved', 'Title'],
        rows.map((i) => [
          cell(field(i, 'id')),
          cell(field(i, 'status')),
          cell(field(i, 'severity')),
          cell(field(i, 'exchange')),
          cell(field(i, 'startedAt', 'started_at')),
          cell(field(i, 'resolvedAt', 'resolved_at')),
          cell(field(i, 'title')),
        ]),
      );
      if (typeof total === 'number' && offset + rows.length < total) {
        prettyDim(`More incidents match (use --offset ${offset + rows.length} to page)`);
      }
    });
  });
}

export async function dataQualityIncidentCommand(incidentId: string, options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  const id = String(incidentId ?? '').trim();
  if (id === '') exitError('Incident id is required.', EXIT.VALIDATION);
  await withDataQuality(options, async (dq) => {
    const incident = await dq.getIncident(id);
    emitDocument(incident, { format }, () => {
      prettyHeader(`Incident ${id}`);
      printIncident(incident);
    });
  });
}

// ── latency ─────────────────────────────────────────────────────────────

export async function dataQualityLatencyCommand(options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  await withDataQuality(options, async (dq) => {
    const latency = await dq.latency();
    emitDocument(latency, { format }, () => {
      prettyHeader('Latency');
      prettyField('Measured at', field(latency, 'measuredAt', 'measured_at') as string | undefined);
      prettyTable(
        ['Exchange', 'WebSocket ms', 'REST ms', 'REST 1h avg ms', 'Order Book Lag ms', 'Fills Lag ms', 'Funding Lag ms', 'OI Lag ms'],
        entries(field(latency, 'exchanges')).map(([name, l]) => {
          const ws = field(l, 'websocket');
          const rest = field(l, 'restApi', 'rest_api');
          const fresh = field(l, 'dataFreshness', 'data_freshness');
          return [
            name,
            cell(field(ws, 'currentMs', 'current_ms')),
            cell(field(rest, 'currentMs', 'current_ms')),
            cell(field(rest, 'avg1hMs', 'avg_1h_ms')),
            cell(field(fresh, 'orderbookLagMs', 'orderbook_lag_ms')),
            cell(field(fresh, 'fillsLagMs', 'fills_lag_ms')),
            cell(field(fresh, 'fundingLagMs', 'funding_lag_ms')),
            cell(field(fresh, 'oiLagMs', 'oi_lag_ms')),
          ];
        }),
      );
    });
  });
}

// ── sla ─────────────────────────────────────────────────────────────────

export async function dataQualitySlaCommand(options: BaseOptions & { year?: string; month?: string }): Promise<void> {
  const format = validateFormat(options.format);
  const params = compact({
    year: parseIntInRange(options.year, 'year', 2023, 9999),
    month: parseIntInRange(options.month, 'month', 1, 12),
  });
  await withDataQuality(options, async (dq) => {
    const sla = await dq.sla(Object.keys(params).length ? params : undefined);
    emitDocument(sla, { format }, () => {
      const targets = field(sla, 'slaTargets', 'sla_targets');
      const actual = field(sla, 'actual');
      const completeness = field(actual, 'dataCompleteness', 'data_completeness');
      prettyHeader(`SLA ${cell(field(sla, 'period'))}`);
      prettyField(
        'Uptime',
        `${cell(field(actual, 'uptime'))}% against ${cell(field(targets, 'uptime'))}% (${cell(field(actual, 'uptimeStatus', 'uptime_status'))})`,
      );
      prettyField(
        'Data completeness',
        `${cell(field(completeness, 'overall'))}% against ${cell(field(targets, 'dataCompleteness', 'data_completeness'))}% (${cell(field(actual, 'completenessStatus', 'completeness_status'))})`,
      );
      prettyField(
        'API latency p99',
        `${cell(field(actual, 'apiLatencyP99Ms', 'api_latency_p99_ms'))} ms against ${cell(field(targets, 'apiLatencyP99Ms', 'api_latency_p99_ms'))} ms (${cell(field(actual, 'latencyStatus', 'latency_status'))})`,
      );
      prettyField('Incidents', field(sla, 'incidentsThisPeriod', 'incidents_this_period') as number | undefined);
      prettyField('Downtime minutes', field(sla, 'totalDowntimeMinutes', 'total_downtime_minutes') as number | undefined);
    });
  });
}

// ── positions freshness ─────────────────────────────────────────────────

export async function dataQualityPositionsFreshnessCommand(options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  await withDataQuality(
    options,
    async (dq) => {
      const venues = await dq.positionsFreshness();
      emitDocument(venues, { format }, () => {
        const rows = Array.isArray(venues) ? venues : [];
        prettyHeader('Positions Freshness');
        prettyTable(
          ['Venue', 'Product', 'Live Snapshot', 'Age s', 'Stale', 'Quality', 'Hourly Snapshot', 'Built Through', 'Finalized Through'],
          rows.map((v) => [
            cell(field(v, 'venue')),
            cell(field(v, 'product')),
            cell(field(v, 'liveSnapshotTs', 'live_snapshot_ts') ?? null),
            cell(field(v, 'liveAgeSeconds', 'live_age_seconds') ?? null),
            field(v, 'stale') === true ? 'yes' : 'no',
            cell(field(v, 'liveQuality', 'live_quality') ?? null),
            cell(field(v, 'hourlySnapshotTs', 'hourly_snapshot_ts') ?? null),
            cell(field(v, 'builtThrough', 'built_through') ?? null),
            cell(field(v, 'finalizedThrough', 'finalized_through') ?? null),
          ]),
        );
      });
    },
    { method: 'positionsFreshness', feature: 'positions freshness' },
  );
}
