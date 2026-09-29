// `oxa webhooks ...`: manage webhook endpoints, subscriptions, and watched
// wallets, preview a rule with an estimate or a dry run, and verify a
// delivery's signature. Every call goes through the SDK's webhooks resource
// and signature helpers.
//
// Subscription filters and preview configurations are wire-shaped: the SDK
// sends them exactly as written (min_notional_usd, conditions[].metric), so
// the CLI takes them as JSON and passes them through unchanged.
//
// Deleting and rotating ask for confirmation: pass --yes, or answer the prompt
// in an interactive terminal. Without a terminal and without --yes, nothing is
// changed.

import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { resolveApiKey, createClient } from '../lib/client.js';
import {
  validateFormat,
  prettyHeader,
  prettyField,
  prettyTable,
  prettyDim,
  prettySuccess,
  outputJson,
  EXIT,
  exitError,
} from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { parseIntInRange } from '../lib/params.js';
import { getWebhookVerifier, getWebhooksResource, type WebhooksResource } from '../lib/sdk.js';
import { cell, field } from '../lib/emit.js';

interface BaseOptions {
  apiKey?: string;
  format: string;
}

interface ConfirmOptions extends BaseOptions {
  yes?: boolean;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// ── helpers ─────────────────────────────────────────────────────────────

/**
 * Ask before a destructive call. `--yes` skips the prompt; without it the
 * command needs an interactive terminal, and anything but "yes" cancels.
 */
export async function confirmAction(action: string, yes?: boolean): Promise<void> {
  if (yes) return;
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    exitError(`${action} needs confirmation. Pass --yes to confirm.`, EXIT.VALIDATION);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${action}. Type "yes" to continue: `);
    if (answer.trim().toLowerCase() !== 'yes') {
      exitError('Cancelled. Nothing was changed.', EXIT.VALIDATION);
    }
  } finally {
    rl.close();
  }
}

/** A JSON object from an inline flag or a file, never both. */
export function readJsonObject(
  inline: string | undefined,
  file: string | undefined,
  flag: string,
): Record<string, unknown> | undefined {
  if (inline !== undefined && file !== undefined) {
    exitError(`Pass --${flag} or --${flag}-file, not both.`, EXIT.VALIDATION);
  }
  let raw = inline;
  let source = `--${flag}`;
  if (file !== undefined) {
    source = `--${flag}-file ${file}`;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      exitError(`Cannot read ${file}.`, EXIT.VALIDATION);
    }
  }
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    exitError(`${source} is not valid JSON.`, EXIT.VALIDATION);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    exitError(`${source} must be a JSON object, e.g. {"venue":"hyperliquid"}.`, EXIT.VALIDATION);
  }
  return parsed as Record<string, unknown>;
}

function requireId(value: string, label: string): string {
  const id = String(value ?? '').trim();
  if (id === '') exitError(`${label} is required.`, EXIT.VALIDATION);
  return id;
}

function parseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    exitError(`--url must be an absolute URL, e.g. https://example.com/webhooks (got ${raw})`, EXIT.VALIDATION);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    exitError(`--url must be an http(s) URL (got ${raw})`, EXIT.VALIDATION);
  }
  return raw;
}

/** Run one webhooks call with the resource, mapping failures to exit codes. */
async function withWebhooks(options: BaseOptions, run: (webhooks: WebhooksResource) => Promise<void>): Promise<void> {
  const apiKey = resolveApiKey(options.apiKey);
  const webhooks = getWebhooksResource(createClient(apiKey));
  try {
    await run(webhooks);
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

function rows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// ── catalog and limits ──────────────────────────────────────────────────

export async function webhooksEventTypesCommand(options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  await withWebhooks(options, async (webhooks) => {
    const catalog = await webhooks.eventTypes();
    if (format !== 'pretty') return outputJson(catalog);
    const entries = rows(catalog);
    prettyHeader(`Webhook Event Types, ${entries.length}`);
    prettyTable(
      ['Type', 'Live', 'Scope', 'Venues', 'Latency'],
      entries.map((e) => {
        const venues = field(e, 'venues');
        return [
          cell(field(e, 'type')),
          field(e, 'live') === true ? 'yes' : 'no',
          cell(field(e, 'scope')),
          Array.isArray(venues) && venues.length ? venues.join(', ') : '-',
          cell(field(e, 'latencyClass', 'latency_class')),
        ];
      }),
    );
    prettyDim('Use --format json for each type\'s filters, parameters, metrics, and operators.');
    process.stdout.write('\n');
  });
}

function printUsage(label: string, usage: unknown): void {
  const used = field(usage, 'used');
  const limit = field(usage, 'limit');
  if (used === undefined && limit === undefined) return;
  prettyField(label, `${cell(used)} of ${limit === undefined ? 'unlimited' : cell(limit)}`);
}

export async function webhooksLimitsCommand(options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  await withWebhooks(options, async (webhooks) => {
    const limits = await webhooks.limits();
    if (format !== 'pretty') return outputJson(limits);
    prettyHeader('Webhook Limits');
    prettyField('Plan', (field(limits, 'planLabel', 'plan_label') ?? field(limits, 'plan')) as string | undefined);
    prettyField('Delivery included', field(limits, 'included') === true ? 'yes' : 'no');
    prettyField('Previews included', field(limits, 'previewIncluded', 'preview_included') === true ? 'yes' : 'no');
    printUsage('Endpoints', field(limits, 'endpoints'));
    printUsage('Subscriptions', field(limits, 'subscriptions'));
    printUsage('Watched wallets', field(limits, 'watchedAddresses', 'watched_addresses'));
    const budget = field(limits, 'deliveriesPerDay', 'deliveries_per_day');
    if (budget) {
      const unlimited = field(budget, 'unlimited') === true;
      prettyField(
        'Deliveries today',
        `${cell(field(budget, 'used'))} of ${unlimited ? 'unlimited' : cell(field(budget, 'limit'))}`,
      );
      prettyField('Budget resets at', field(budget, 'resetsAt', 'resets_at') as string | undefined);
    }
    const paused = field(limits, 'pausedSubscriptions', 'paused_subscriptions');
    prettyField('Paused subscriptions', field(paused, 'count') as number | undefined);
    prettyField('Pause note', field(paused, 'message') as string | undefined);
    prettyField('Notice', field(limits, 'notice') as string | undefined);
    process.stdout.write('\n');
  });
}

// ── endpoints ───────────────────────────────────────────────────────────

export async function webhooksEndpointsListCommand(options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  await withWebhooks(options, async (webhooks) => {
    const endpoints = await webhooks.listEndpoints();
    if (format !== 'pretty') return outputJson(endpoints);
    const entries = rows(endpoints);
    prettyHeader(`Webhook Endpoints, ${entries.length}`);
    if (entries.length === 0) {
      prettyDim('No endpoints. Create one with `oxa webhooks endpoints create --url <url>`.');
    } else {
      prettyTable(
        ['ID', 'Status', 'Failures', 'URL', 'Description', 'Created'],
        entries.map((e) => [
          cell(field(e, 'id')),
          cell(field(e, 'status')),
          cell(field(e, 'consecutiveFailures', 'consecutive_failures')),
          cell(field(e, 'url')),
          cell(field(e, 'description')),
          cell(field(e, 'createdAt', 'created_at')),
        ]),
      );
    }
    process.stdout.write('\n');
  });
}

export async function webhooksEndpointsCreateCommand(
  options: BaseOptions & { url: string; description?: string },
): Promise<void> {
  const format = validateFormat(options.format);
  const url = parseUrl(options.url);
  await withWebhooks(options, async (webhooks) => {
    const endpoint = await webhooks.createEndpoint({ url, description: options.description });
    if (format !== 'pretty') return outputJson(endpoint);
    prettySuccess('Endpoint created');
    prettyField('ID', field(endpoint, 'id') as string | undefined);
    prettyField('URL', field(endpoint, 'url') as string | undefined);
    prettyField('Status', field(endpoint, 'status') as string | undefined);
    prettyField('Signing secret', field(endpoint, 'secret') as string | undefined);
    prettyDim('Store the signing secret now: it is not shown again.');
    process.stdout.write('\n');
  });
}

export async function webhooksEndpointsDeleteCommand(endpointId: string, options: ConfirmOptions): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(endpointId, 'Endpoint id');
  resolveApiKey(options.apiKey);
  await confirmAction(`Delete webhook endpoint ${id} and every subscription that points at it`, options.yes);
  await withWebhooks(options, async (webhooks) => {
    await webhooks.deleteEndpoint(id);
    if (format === 'pretty') prettySuccess(`Endpoint ${id} deleted`);
    else outputJson({ deleted: true, endpointId: id });
  });
}

export async function webhooksEndpointsEnableCommand(endpointId: string, options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(endpointId, 'Endpoint id');
  await withWebhooks(options, async (webhooks) => {
    await webhooks.enableEndpoint(id);
    if (format === 'pretty') prettySuccess(`Endpoint ${id} enabled; deliveries resume on the next matching event`);
    else outputJson({ enabled: true, endpointId: id });
  });
}

export async function webhooksEndpointsRotateSecretCommand(endpointId: string, options: ConfirmOptions): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(endpointId, 'Endpoint id');
  resolveApiKey(options.apiKey);
  await confirmAction(
    `Rotate the signing secret of webhook endpoint ${id}. The previous secret keeps verifying for 24 hours`,
    options.yes,
  );
  await withWebhooks(options, async (webhooks) => {
    const rotated = await webhooks.rotateSecret(id);
    const secret = field(rotated, 'secret');
    if (format !== 'pretty') return outputJson({ endpointId: id, secret: secret ?? null });
    prettySuccess(`Signing secret rotated for endpoint ${id}`);
    prettyField('New signing secret', secret as string | undefined);
    prettyDim('Store it now: it is not shown again. The previous secret keeps verifying for 24 hours.');
    process.stdout.write('\n');
  });
}

export async function webhooksEndpointsTestCommand(endpointId: string, options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(endpointId, 'Endpoint id');
  await withWebhooks(options, async (webhooks) => {
    const queued = await webhooks.testEndpoint(id);
    if (format !== 'pretty') return outputJson(queued);
    prettySuccess(`Test delivery queued for endpoint ${id}`);
    prettyField('Delivery ID', field(queued, 'deliveryId', 'delivery_id') as string | undefined);
    prettyField('Event ID', field(queued, 'eventId', 'event_id') as string | undefined);
    process.stdout.write('\n');
  });
}

export async function webhooksEndpointsDeliveriesCommand(
  endpointId: string,
  options: BaseOptions & { limit?: string },
): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(endpointId, 'Endpoint id');
  const limit = parseIntInRange(options.limit, 'limit', 1, 200);
  await withWebhooks(options, async (webhooks) => {
    const deliveries = await webhooks.listDeliveries(id, limit === undefined ? undefined : { limit });
    if (format !== 'pretty') return outputJson(deliveries);
    const entries = rows(deliveries);
    prettyHeader(`Deliveries for endpoint ${id}, ${entries.length} newest first`);
    if (entries.length === 0) {
      prettyDim('No deliveries yet.');
    } else {
      prettyTable(
        ['Delivery ID', 'Event Type', 'State', 'Attempts', 'Status', 'Latency ms', 'Created', 'Error'],
        entries.map((d) => [
          cell(field(d, 'id')),
          cell(field(d, 'eventType', 'event_type')),
          cell(field(d, 'state')),
          cell(field(d, 'attempts')),
          cell(field(d, 'lastStatusCode', 'last_status_code')),
          cell(field(d, 'lastLatencyMs', 'last_latency_ms')),
          cell(field(d, 'createdAt', 'created_at')),
          cell(field(d, 'lastError', 'last_error')),
        ]),
      );
    }
    process.stdout.write('\n');
  });
}

export async function webhooksRedeliverCommand(deliveryId: string, options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(deliveryId, 'Delivery id');
  await withWebhooks(options, async (webhooks) => {
    const queued = await webhooks.redeliver(id);
    if (format !== 'pretty') return outputJson(queued);
    prettySuccess(`Delivery ${id} queued again`);
    prettyField('Event ID', field(queued, 'eventId', 'event_id') as string | undefined);
    prettyField('Event type', field(queued, 'eventType', 'event_type') as string | undefined);
    prettyField('Next attempt', field(queued, 'nextAttemptAt', 'next_attempt_at') as string | undefined);
    process.stdout.write('\n');
  });
}

// ── subscriptions ───────────────────────────────────────────────────────

function subscriptionRow(s: unknown): string[] {
  return [
    cell(field(s, 'id')),
    cell(field(s, 'eventType', 'event_type')),
    cell(field(s, 'endpointId', 'endpoint_id')),
    field(s, 'enabled') === true ? 'yes' : 'no',
    cell(field(s, 'status')),
    cell(field(s, 'suppressedCount', 'suppressed_count')),
    cell(field(s, 'filters')),
  ];
}

const SUBSCRIPTION_HEADERS = ['ID', 'Event Type', 'Endpoint', 'Enabled', 'Status', 'Suppressed', 'Filters'];

function printSubscription(title: string, s: unknown): void {
  prettySuccess(title);
  prettyField('ID', field(s, 'id') as string | undefined);
  prettyField('Event type', field(s, 'eventType', 'event_type') as string | undefined);
  prettyField('Endpoint', field(s, 'endpointId', 'endpoint_id') as string | undefined);
  prettyField('Enabled', field(s, 'enabled') === true ? 'yes' : 'no');
  prettyField('Status', field(s, 'status') as string | undefined);
  prettyField('Pause', field(s, 'pauseMessage', 'pause_message') as string | undefined);
  prettyField('Filters', cell(field(s, 'filters') ?? {}));
}

export async function webhooksSubscriptionsListCommand(options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  await withWebhooks(options, async (webhooks) => {
    const subscriptions = await webhooks.listSubscriptions();
    if (format !== 'pretty') return outputJson(subscriptions);
    const entries = rows(subscriptions);
    prettyHeader(`Webhook Subscriptions, ${entries.length}`);
    if (entries.length === 0) {
      prettyDim('No subscriptions.');
    } else {
      prettyTable(SUBSCRIPTION_HEADERS, entries.map(subscriptionRow));
      const paused = entries.filter((s) => field(s, 'status') === 'auto_paused').length;
      if (paused) prettyDim(`${paused} paused. Resume with \`oxa webhooks subscriptions resume-all\`.`);
    }
    process.stdout.write('\n');
  });
}

export async function webhooksSubscriptionsCreateCommand(
  options: BaseOptions & { endpoint: string; eventType: string; filters?: string; filtersFile?: string },
): Promise<void> {
  const format = validateFormat(options.format);
  const endpointId = requireId(options.endpoint, '--endpoint');
  const eventType = requireId(options.eventType, '--event-type');
  const filters = readJsonObject(options.filters, options.filtersFile, 'filters');
  await withWebhooks(options, async (webhooks) => {
    const subscription = await webhooks.createSubscription({
      endpointId,
      eventType,
      ...(filters ? { filters } : {}),
    });
    if (format !== 'pretty') return outputJson(subscription);
    printSubscription('Subscription created', subscription);
    process.stdout.write('\n');
  });
}

export async function webhooksSubscriptionsUpdateCommand(
  subscriptionId: string,
  options: BaseOptions & { filters?: string; filtersFile?: string; enabled?: string },
): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(subscriptionId, 'Subscription id');
  const filters = readJsonObject(options.filters, options.filtersFile, 'filters');
  let enabled: boolean | undefined;
  if (options.enabled !== undefined) {
    if (options.enabled !== 'true' && options.enabled !== 'false') {
      exitError(`--enabled must be true or false (got ${options.enabled})`, EXIT.VALIDATION);
    }
    enabled = options.enabled === 'true';
  }
  if (filters === undefined && enabled === undefined) {
    exitError('Nothing to update. Pass --filters, --filters-file, or --enabled.', EXIT.VALIDATION);
  }
  await withWebhooks(options, async (webhooks) => {
    const subscription = await webhooks.updateSubscription(id, {
      ...(filters !== undefined ? { filters } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    });
    if (format !== 'pretty') return outputJson(subscription);
    printSubscription('Subscription updated', subscription);
    process.stdout.write('\n');
  });
}

export async function webhooksSubscriptionsDeleteCommand(subscriptionId: string, options: ConfirmOptions): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(subscriptionId, 'Subscription id');
  resolveApiKey(options.apiKey);
  await confirmAction(`Delete webhook subscription ${id}`, options.yes);
  await withWebhooks(options, async (webhooks) => {
    await webhooks.deleteSubscription(id);
    if (format === 'pretty') prettySuccess(`Subscription ${id} deleted`);
    else outputJson({ deleted: true, subscriptionId: id });
  });
}

function printGap(gap: unknown): void {
  if (!gap) return;
  const window = field(gap, 'replayWindow', 'replay_window');
  prettyField('Missed window', `${cell(field(window, 'start'))} to ${cell(field(window, 'end'))}`);
  prettyField('Suppressed matches', cell(field(gap, 'suppressedCount', 'suppressed_count') ?? null));
  prettyField('Gap note', field(gap, 'note') as string | undefined);
}

export async function webhooksSubscriptionsResumeCommand(subscriptionId: string, options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(subscriptionId, 'Subscription id');
  await withWebhooks(options, async (webhooks) => {
    const result = await webhooks.resumeSubscription(id);
    if (format !== 'pretty') return outputJson(result);
    prettySuccess(`Subscription ${id} resumed`);
    prettyField('Status', field(field(result, 'subscription'), 'status') as string | undefined);
    printGap(field(result, 'gap'));
    prettyField('Note', field(result, 'note') as string | undefined);
    process.stdout.write('\n');
  });
}

export async function webhooksSubscriptionsResumeAllCommand(options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  await withWebhooks(options, async (webhooks) => {
    const result = await webhooks.resumeAllSubscriptions();
    if (format !== 'pretty') return outputJson(result);
    prettySuccess(`${cell(field(result, 'resumedCount', 'resumed_count') ?? 0)} subscriptions resumed`);
    printGap(field(result, 'gap'));
    prettyField('Note', field(result, 'note') as string | undefined);
    process.stdout.write('\n');
  });
}

// ── previews ────────────────────────────────────────────────────────────

export async function webhooksEstimateCommand(
  options: BaseOptions & { eventType: string; config?: string; configFile?: string; lookbackDays?: string },
): Promise<void> {
  const format = validateFormat(options.format);
  const eventType = requireId(options.eventType, '--event-type');
  const config = readJsonObject(options.config, options.configFile, 'config');
  const lookbackDays = parseIntInRange(options.lookbackDays, 'lookback-days', 1, 30);
  await withWebhooks(options, async (webhooks) => {
    const estimate = await webhooks.estimate({
      eventType,
      ...(config ? { config } : {}),
      ...(lookbackDays !== undefined ? { lookbackDays } : {}),
    });
    if (format !== 'pretty') return outputJson(estimate);
    const window = field(estimate, 'window');
    prettyHeader(`Estimate for ${eventType}`);
    prettyField('Window', `${cell(field(window, 'from'))} to ${cell(field(window, 'to'))}`);
    prettyField('Days', field(estimate, 'days') as number | undefined);
    prettyField('Total matches', field(estimate, 'total') as number | undefined);
    prettyField('Per day, median', field(estimate, 'perDayP50', 'per_day_p50') as number | undefined);
    prettyField('Per day, busiest', field(estimate, 'perDayMax', 'per_day_max') as number | undefined);
    prettyField('Primary metric', field(estimate, 'primaryMetric', 'primary_metric') as string | undefined);
    const basis = field(estimate, 'basis');
    prettyField('Basis', field(basis, 'mode') as string | undefined);
    prettyField('Basis note', field(basis, 'note') as string | undefined);
    const ladder = rows(field(estimate, 'ladder'));
    if (ladder.length) {
      prettyTable(
        ['Threshold', 'Per Day'],
        ladder.map((r) => [cell(field(r, 'value')), cell(field(r, 'perDay', 'per_day'))]),
      );
    }
    process.stdout.write('\n');
  });
}

export async function webhooksDryRunCommand(
  options: BaseOptions & {
    eventType: string;
    config?: string;
    configFile?: string;
    lookbackS?: string;
    limit?: string;
  },
): Promise<void> {
  const format = validateFormat(options.format);
  const eventType = requireId(options.eventType, '--event-type');
  const config = readJsonObject(options.config, options.configFile, 'config');
  const lookbackS = parseIntInRange(options.lookbackS, 'lookback-s', 60, 86_400);
  const limit = parseIntInRange(options.limit, 'limit', 1, 200);
  await withWebhooks(options, async (webhooks) => {
    const result = await webhooks.dryRun({
      eventType,
      ...(config ? { config } : {}),
      ...(lookbackS !== undefined ? { lookbackS } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    if (format !== 'pretty') return outputJson(result);
    const window = field(result, 'window');
    const occurrences = rows(field(result, 'occurrences'));
    prettyHeader(`Dry run for ${eventType}`);
    prettyField('Window', `${cell(field(window, 'from'))} to ${cell(field(window, 'to'))}`);
    prettyField('Matched', field(result, 'matched') as number | undefined);
    prettyField('Truncated', field(result, 'truncated') === true ? 'yes' : 'no');
    if (occurrences.length) {
      const shown = occurrences.slice(0, 20);
      prettyTable(
        ['Observed (estimate)', 'Data'],
        shown.map((o) => [
          cell(field(o, 'observedAtEstimate', 'observed_at_estimate')),
          cell(field(o, 'data')),
        ]),
      );
      if (occurrences.length > shown.length) prettyDim(`... and ${occurrences.length - shown.length} more`);
    }
    process.stdout.write('\n');
  });
}

// ── watched addresses ───────────────────────────────────────────────────

export async function webhooksAddressesListCommand(options: BaseOptions): Promise<void> {
  const format = validateFormat(options.format);
  await withWebhooks(options, async (webhooks) => {
    const list = await webhooks.listAddresses();
    if (format !== 'pretty') return outputJson(list);
    const entries = rows(field(list, 'addresses'));
    prettyHeader(`Watched Wallets, ${entries.length} of ${cell(field(list, 'limit'))}`);
    if (entries.length === 0) {
      prettyDim('No watched wallets.');
    } else {
      prettyTable(
        ['ID', 'Address', 'Label', 'Added'],
        entries.map((a) => [
          cell(field(a, 'id')),
          cell(field(a, 'address')),
          cell(field(a, 'label')),
          cell(field(a, 'createdAt', 'created_at')),
        ]),
      );
    }
    process.stdout.write('\n');
  });
}

export async function webhooksAddressesAddCommand(
  options: BaseOptions & { address: string; label?: string },
): Promise<void> {
  const format = validateFormat(options.format);
  if (!ADDRESS_RE.test(options.address)) {
    exitError(`--address must be a 0x-prefixed, 40 hex character wallet address (got ${options.address})`, EXIT.VALIDATION);
  }
  if (options.label !== undefined && options.label.length > 64) {
    exitError('--label must be at most 64 characters.', EXIT.VALIDATION);
  }
  await withWebhooks(options, async (webhooks) => {
    const added = await webhooks.addAddress({ address: options.address, label: options.label });
    if (format !== 'pretty') return outputJson(added);
    prettySuccess('Wallet watched');
    prettyField('ID', field(added, 'id') as string | undefined);
    prettyField('Address', field(added, 'address') as string | undefined);
    prettyField('Label', field(added, 'label') as string | undefined);
    process.stdout.write('\n');
  });
}

export async function webhooksAddressesDeleteCommand(addressId: string, options: ConfirmOptions): Promise<void> {
  const format = validateFormat(options.format);
  const id = requireId(addressId, 'Watched-address id');
  resolveApiKey(options.apiKey);
  await confirmAction(`Stop watching the wallet with id ${id}`, options.yes);
  await withWebhooks(options, async (webhooks) => {
    await webhooks.deleteAddress(id);
    if (format === 'pretty') {
      prettySuccess(`Watched wallet ${id} removed`);
      prettyDim('Subscriptions that name this wallet keep their stored filters.');
    } else {
      outputJson({ deleted: true, addressId: id });
    }
  });
}

// ── verify ──────────────────────────────────────────────────────────────

interface VerifyOptions {
  secret?: string[];
  signature: string;
  bodyFile?: string;
  tolerance?: string;
  ignoreTimestamp?: boolean;
  format: string;
}

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

/** The raw body bytes, exactly as delivered: from --body-file, or stdin. */
async function readBody(bodyFile: string | undefined): Promise<Buffer> {
  if (bodyFile !== undefined && bodyFile !== '-') {
    try {
      return readFileSync(bodyFile);
    } catch {
      exitError(`Cannot read ${bodyFile}.`, EXIT.VALIDATION);
    }
  }
  if (bodyFile === undefined && process.stdin.isTTY) {
    exitError('Pass the raw delivery body with --body-file <path>, or pipe it on stdin.', EXIT.VALIDATION);
  }
  return readStdin();
}

/** Accept the header value alone, or the whole `0xa-signature: ...` line. */
function signatureValue(raw: string): string {
  return raw.replace(/^\s*0xa-signature\s*:\s*/i, '').trim();
}

/**
 * `oxa webhooks verify`: check a delivery's `0xa-signature` against the raw
 * body with the SDK verifier. The secret is never printed; error messages are
 * scrubbed of it as well.
 */
export async function webhooksVerifyCommand(options: VerifyOptions): Promise<void> {
  const format = validateFormat(options.format);
  const secrets = [...(options.secret ?? [])];
  if (secrets.length === 0 && process.env.OXA_WEBHOOK_SECRET) secrets.push(process.env.OXA_WEBHOOK_SECRET);
  if (secrets.every((s) => s.trim() === '')) {
    exitError('A signing secret is required. Pass --secret or set OXA_WEBHOOK_SECRET.', EXIT.VALIDATION);
  }
  const signature = signatureValue(options.signature ?? '');
  if (signature === '') exitError('--signature is required: the 0xa-signature header value.', EXIT.VALIDATION);
  if (options.ignoreTimestamp && options.tolerance !== undefined) {
    exitError('Pass --tolerance or --ignore-timestamp, not both.', EXIT.VALIDATION);
  }
  let toleranceSeconds: number | undefined;
  if (options.ignoreTimestamp) {
    toleranceSeconds = Number.POSITIVE_INFINITY;
  } else if (options.tolerance !== undefined) {
    toleranceSeconds = parseIntInRange(options.tolerance, 'tolerance', 0, 31_536_000);
  }

  const scrub = (message: string): string =>
    secrets.reduce((text, s) => (s ? text.split(s).join('[secret]') : text), message);

  const verifier = getWebhookVerifier();
  const payload = await readBody(options.bodyFile);

  let event: Record<string, unknown>;
  try {
    event = await verifier.constructWebhookEvent({
      payload,
      secret: secrets,
      signature,
      ...(toleranceSeconds !== undefined ? { toleranceSeconds } : {}),
      subtle: webcrypto.subtle,
    });
  } catch (error) {
    if (error instanceof verifier.WebhookSignatureError) {
      exitError(scrub(`Signature did not verify (${error.reason}): ${error.message}`), EXIT.VALIDATION);
    }
    exitError(scrub(error instanceof Error ? error.message : 'Verification failed'), EXIT.INTERNAL);
  }

  const parsed = verifier.parseWebhookSignatureHeader(signature);
  const signedAt = parsed ? new Date(parsed.timestampSeconds * 1000).toISOString() : null;
  const result = {
    valid: true,
    eventId: event.id ?? null,
    eventType: event.type ?? null,
    signedAt,
    event,
  };
  if (format === 'pretty') {
    prettySuccess('Signature verified');
    prettyField('Event ID', result.eventId as string | null);
    prettyField('Event type', result.eventType as string | null);
    prettyField('Signed at', signedAt);
    process.stdout.write('\n');
  } else {
    outputJson(result);
  }
  process.exit(EXIT.SUCCESS);
}
