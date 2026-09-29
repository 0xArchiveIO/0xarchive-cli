import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { OxArchiveError } from '@0xarchive/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureIo, lastError, runCli, stderrText, stdoutJson, stdoutText } from './helpers.js';

// The SDK's webhooks resource is stubbed, so each test checks which method a
// command calls, with which arguments, and what it prints. No test reaches the
// API. Signature verification runs the SDK's own verifier against the
// published test vectors when the installed SDK has it.
const sdk = vi.hoisted(() => {
  const resource = () => ({
    eventTypes: vi.fn(),
    limits: vi.fn(),
    listEndpoints: vi.fn(),
    createEndpoint: vi.fn(),
    deleteEndpoint: vi.fn(),
    enableEndpoint: vi.fn(),
    rotateSecret: vi.fn(),
    testEndpoint: vi.fn(),
    listDeliveries: vi.fn(),
    redeliver: vi.fn(),
    listSubscriptions: vi.fn(),
    createSubscription: vi.fn(),
    updateSubscription: vi.fn(),
    deleteSubscription: vi.fn(),
    resumeSubscription: vi.fn(),
    resumeAllSubscriptions: vi.fn(),
    estimate: vi.fn(),
    dryRun: vi.fn(),
    listAddresses: vi.fn(),
    addAddress: vi.fn(),
    deleteAddress: vi.fn(),
  });
  const state = {
    webhooks: resource(),
    construct: undefined as undefined | ((options: any) => Promise<unknown>),
    answer: vi.fn(async () => 'yes'),
    readlineOptions: [] as unknown[],
  };
  return {
    state,
    reset() {
      state.webhooks = resource();
      state.construct = undefined;
      state.answer = vi.fn(async () => 'yes');
      state.readlineOptions = [];
    },
  };
});

vi.mock('@0xarchive/sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  class OxArchive {
    get webhooks() {
      return sdk.state.webhooks;
    }
  }
  // An SDK older than the floor has no verifier; these stand-ins let the
  // argument-handling tests run against any installed SDK.
  class FallbackSignatureError extends Error {
    constructor(
      readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  }
  const fallbackParse = (header: string) => {
    const t = /(?:^|,)t=(\d+)/.exec(header)?.[1];
    return t ? { timestamp: t, timestampSeconds: Number(t), signatures: [] } : null;
  };
  return {
    ...actual,
    OxArchive,
    WebhookSignatureError: actual.WebhookSignatureError ?? FallbackSignatureError,
    parseWebhookSignatureHeader: actual.parseWebhookSignatureHeader ?? fallbackParse,
    constructWebhookEvent: (options: unknown) =>
      sdk.state.construct ? sdk.state.construct(options) : actual.constructWebhookEvent(options),
  };
});

vi.mock('node:readline/promises', () => ({
  createInterface: (options: unknown) => {
    sdk.state.readlineOptions.push(options);
    return { question: (prompt: string) => sdk.state.answer(prompt), close: vi.fn() };
  },
}));

const actualSdk = await vi.importActual<Record<string, any>>('@0xarchive/sdk');
const HAS_VERIFIER = typeof actualSdk.constructWebhookEvent === 'function';

const ENDPOINT_ID = '5b0d6c1e-8a4e-4f7e-9a51-0e1f2d3c4b5a';
const SUBSCRIPTION_ID = '7c2e9d4a-1b3f-4c5d-8e6f-a7b8c9d0e1f2';
const ADDRESS_ID = '3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d';
const DELIVERY_ID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const WALLET = '0x1111111111111111111111111111111111111111';

// Published test vectors: a 186-byte body with no trailing newline, signed at
// t=1758240000 with placeholder secrets.
const T = 1758240000;
const BODY =
  '{"id": "11111111-1111-4111-8111-111111111111", "data": {"message": "Test event from 0xArchive."}, ' +
  '"type": "webhook.test", "observed_at": "2026-09-19T00:00:00+00:00", "schema_version": 1}';
const SECRET = `whsec_${'0'.repeat(64)}`;
const PREVIOUS = `whsec_${'1'.repeat(64)}`;
const SIG = `t=${T},v1=027f40e95c9aa4e8097c22493f6f019ad25407ddf35b13103f95e5501d49ec0b`;
const SIG_ROTATING = `${SIG},v1=f8e6ae6781adad70ed0f94773fa2745147b718136e83fc22cafa09ded928095c`;

function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
  Object.defineProperty(process.stderr, 'isTTY', { value, configurable: true });
}

describe('oxa webhooks', () => {
  let dir: string;

  beforeEach(() => {
    sdk.reset();
    captureIo();
    vi.stubEnv('OXA_API_KEY', 'test-key');
    setTty(false);
    dir = mkdtempSync(join(tmpdir(), 'oxa-webhooks-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('catalog and limits', () => {
    it('prints the event catalog as JSON and as a table', async () => {
      const catalog = [
        { type: 'market.liquidation', live: true, scope: 'public', venues: ['hyperliquid', 'hip3'], latencyClass: 'seconds' },
        { type: 'oracle.stall', live: false, scope: 'public', venues: ['hip3'], latencyClass: 'minutes' },
      ];
      sdk.state.webhooks.eventTypes.mockResolvedValue(catalog);
      expect(await runCli('webhooks', 'event-types')).toBe(0);
      expect(stdoutJson()).toEqual(catalog);

      vi.mocked(process.stdout.write).mockClear();
      expect(await runCli('webhooks', 'event-types', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toMatch(/market\.liquidation\s+yes\s+public\s+hyperliquid, hip3\s+seconds/);
      expect(stdoutText()).toMatch(/oracle\.stall\s+no/);
    });

    it('prints limits with usage against each cap', async () => {
      const limits = {
        plan: 'build',
        planLabel: 'Build',
        included: true,
        previewIncluded: true,
        endpoints: { used: 1, limit: 1, remaining: 0 },
        subscriptions: { used: 3, limit: 8, remaining: 5 },
        watchedAddresses: { used: 0, limit: 2, remaining: 2 },
        deliveriesPerDay: { used: 12, limit: 5000, remaining: 4988, unlimited: false, resetsAt: '2026-09-30T00:00:00Z' },
        pausedSubscriptions: { count: 0, reasons: [] },
      };
      sdk.state.webhooks.limits.mockResolvedValue(limits);
      expect(await runCli('webhooks', 'limits', '--format', 'pretty')).toBe(0);
      const text = stdoutText();
      expect(text).toContain('Plan: Build');
      expect(text).toContain('Endpoints: 1 of 1');
      expect(text).toContain('Subscriptions: 3 of 8');
      expect(text).toContain('Deliveries today: 12 of 5000');
    });
  });

  describe('endpoints', () => {
    it('lists endpoints', async () => {
      const endpoints = [{ id: ENDPOINT_ID, url: 'https://example.com/hook', description: '', status: 'active' }];
      sdk.state.webhooks.listEndpoints.mockResolvedValue(endpoints);
      expect(await runCli('webhooks', 'endpoints', 'list')).toBe(0);
      expect(stdoutJson()).toEqual(endpoints);
    });

    it('creates an endpoint and prints its one-time secret', async () => {
      const created = { id: ENDPOINT_ID, url: 'https://example.com/hook', description: 'desk', status: 'active', secret: SECRET };
      sdk.state.webhooks.createEndpoint.mockResolvedValue(created);
      expect(
        await runCli('webhooks', 'endpoints', 'create', '--url', 'https://example.com/hook', '--description', 'desk'),
      ).toBe(0);
      expect(sdk.state.webhooks.createEndpoint).toHaveBeenCalledWith({ url: 'https://example.com/hook', description: 'desk' });
      expect(stdoutJson()).toEqual(created);
    });

    it('says the secret is shown once in pretty output', async () => {
      sdk.state.webhooks.createEndpoint.mockResolvedValue({ id: ENDPOINT_ID, url: 'https://example.com/hook', secret: SECRET });
      expect(await runCli('webhooks', 'endpoints', 'create', '--url', 'https://example.com/hook', '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toContain(`Signing secret: ${SECRET}`);
      expect(stdoutText()).toContain('it is not shown again');
    });

    it.each(['example.com/hook', 'ftp://example.com/hook'])('refuses the URL %s before any request', async (url) => {
      expect(await runCli('webhooks', 'endpoints', 'create', '--url', url)).toBe(2);
      expect(lastError().error).toMatch(/^--url must be/);
      expect(sdk.state.webhooks.createEndpoint).not.toHaveBeenCalled();
    });

    it('deletes with --yes', async () => {
      sdk.state.webhooks.deleteEndpoint.mockResolvedValue(undefined);
      expect(await runCli('webhooks', 'endpoints', 'delete', ENDPOINT_ID, '--yes')).toBe(0);
      expect(sdk.state.webhooks.deleteEndpoint).toHaveBeenCalledWith(ENDPOINT_ID);
      expect(stdoutJson()).toEqual({ deleted: true, endpointId: ENDPOINT_ID });
    });

    it('refuses to delete without --yes when there is no terminal to ask', async () => {
      expect(await runCli('webhooks', 'endpoints', 'delete', ENDPOINT_ID)).toBe(2);
      expect(lastError().error).toBe(
        `Delete webhook endpoint ${ENDPOINT_ID} and every subscription that points at it needs confirmation. Pass --yes to confirm.`,
      );
      expect(sdk.state.webhooks.deleteEndpoint).not.toHaveBeenCalled();
    });

    it('asks on the terminal, on stderr, and deletes on "yes"', async () => {
      setTty(true);
      sdk.state.webhooks.deleteEndpoint.mockResolvedValue(undefined);
      expect(await runCli('webhooks', 'endpoints', 'delete', ENDPOINT_ID)).toBe(0);
      expect(sdk.state.answer).toHaveBeenCalledWith(
        `Delete webhook endpoint ${ENDPOINT_ID} and every subscription that points at it. Type "yes" to continue: `,
      );
      expect(sdk.state.readlineOptions).toEqual([{ input: process.stdin, output: process.stderr }]);
      expect(sdk.state.webhooks.deleteEndpoint).toHaveBeenCalledWith(ENDPOINT_ID);
    });

    it('cancels on any other answer', async () => {
      setTty(true);
      sdk.state.answer.mockResolvedValue('n');
      expect(await runCli('webhooks', 'endpoints', 'delete', ENDPOINT_ID)).toBe(2);
      expect(lastError().error).toBe('Cancelled. Nothing was changed.');
      expect(sdk.state.webhooks.deleteEndpoint).not.toHaveBeenCalled();
    });

    it('enables an endpoint', async () => {
      sdk.state.webhooks.enableEndpoint.mockResolvedValue(undefined);
      expect(await runCli('webhooks', 'endpoints', 'enable', ENDPOINT_ID)).toBe(0);
      expect(sdk.state.webhooks.enableEndpoint).toHaveBeenCalledWith(ENDPOINT_ID);
      expect(stdoutJson()).toEqual({ enabled: true, endpointId: ENDPOINT_ID });
    });

    it('rotates the secret only with confirmation', async () => {
      expect(await runCli('webhooks', 'endpoints', 'rotate-secret', ENDPOINT_ID)).toBe(2);
      expect(lastError().error).toMatch(/^Rotate the signing secret of webhook endpoint .* Pass --yes to confirm\.$/);
      expect(sdk.state.webhooks.rotateSecret).not.toHaveBeenCalled();

      sdk.state.webhooks.rotateSecret.mockResolvedValue({ secret: PREVIOUS });
      expect(await runCli('webhooks', 'endpoints', 'rotate-secret', ENDPOINT_ID, '--yes')).toBe(0);
      expect(sdk.state.webhooks.rotateSecret).toHaveBeenCalledWith(ENDPOINT_ID);
      expect(stdoutJson()).toEqual({ endpointId: ENDPOINT_ID, secret: PREVIOUS });
    });

    it('queues a test delivery', async () => {
      sdk.state.webhooks.testEndpoint.mockResolvedValue({ deliveryId: DELIVERY_ID, eventId: 'evt' });
      expect(await runCli('webhooks', 'endpoints', 'test', ENDPOINT_ID)).toBe(0);
      expect(sdk.state.webhooks.testEndpoint).toHaveBeenCalledWith(ENDPOINT_ID);
      expect(stdoutJson()).toEqual({ deliveryId: DELIVERY_ID, eventId: 'evt' });
    });

    it('lists deliveries with a limit', async () => {
      const deliveries = [{ id: DELIVERY_ID, eventType: 'webhook.test', state: 'delivered', attempts: 1, payload: {} }];
      sdk.state.webhooks.listDeliveries.mockResolvedValue(deliveries);
      expect(await runCli('webhooks', 'endpoints', 'deliveries', ENDPOINT_ID, '--limit', '20')).toBe(0);
      expect(sdk.state.webhooks.listDeliveries).toHaveBeenCalledWith(ENDPOINT_ID, { limit: 20 });
      expect(stdoutJson()).toEqual(deliveries);

      expect(await runCli('webhooks', 'endpoints', 'deliveries', ENDPOINT_ID)).toBe(0);
      expect(sdk.state.webhooks.listDeliveries).toHaveBeenLastCalledWith(ENDPOINT_ID, undefined);

      expect(await runCli('webhooks', 'endpoints', 'deliveries', ENDPOINT_ID, '--limit', '201')).toBe(2);
      expect(lastError().error).toBe('--limit must be a whole number from 1 to 200 (got 201)');
    });

    it('redelivers a past delivery', async () => {
      const queued = { deliveryId: DELIVERY_ID, eventId: 'evt', eventType: 'webhook.test', state: 'pending', attempts: 0 };
      sdk.state.webhooks.redeliver.mockResolvedValue(queued);
      expect(await runCli('webhooks', 'redeliver', DELIVERY_ID)).toBe(0);
      expect(sdk.state.webhooks.redeliver).toHaveBeenCalledWith(DELIVERY_ID);
      expect(stdoutJson()).toEqual(queued);
    });

    it('maps an API refusal to an auth error without printing the API key', async () => {
      vi.stubEnv('OXA_API_KEY', '0xa_secret_api_key_value');
      sdk.state.webhooks.createEndpoint.mockRejectedValue(
        new OxArchiveError('Webhook delivery is not included on this plan (key 0xa_secret_api_key_value)', 403),
      );
      expect(await runCli('webhooks', 'endpoints', 'create', '--url', 'https://example.com/hook')).toBe(3);
      expect(lastError().type).toBe('auth');
      expect(stderrText()).not.toContain('0xa_secret_api_key_value');
    });
  });

  describe('subscriptions', () => {
    const SUBSCRIPTION = {
      id: SUBSCRIPTION_ID,
      endpointId: ENDPOINT_ID,
      eventType: 'market.liquidation',
      filters: { venue: 'hyperliquid', min_notional_usd: 250000 },
      enabled: true,
      status: 'active',
      suppressedCount: 0,
    };

    it('lists subscriptions', async () => {
      sdk.state.webhooks.listSubscriptions.mockResolvedValue([SUBSCRIPTION]);
      expect(await runCli('webhooks', 'subscriptions', 'list')).toBe(0);
      expect(stdoutJson()).toEqual([SUBSCRIPTION]);
    });

    it('creates a subscription with wire-shaped filters passed through unchanged', async () => {
      sdk.state.webhooks.createSubscription.mockResolvedValue(SUBSCRIPTION);
      const code = await runCli(
        'webhooks', 'subscriptions', 'create', '--endpoint', ENDPOINT_ID, '--event-type', 'market.liquidation',
        '--filters', '{"venue":"hyperliquid","min_notional_usd":250000,"conditions":[{"metric":"notional_usd","op":">=","value":1}]}',
      );
      expect(code).toBe(0);
      expect(sdk.state.webhooks.createSubscription).toHaveBeenCalledWith({
        endpointId: ENDPOINT_ID,
        eventType: 'market.liquidation',
        filters: {
          venue: 'hyperliquid',
          min_notional_usd: 250000,
          conditions: [{ metric: 'notional_usd', op: '>=', value: 1 }],
        },
      });
      expect(stdoutJson()).toEqual(SUBSCRIPTION);
    });

    it('reads filters from a file, and sends none when none are given', async () => {
      const file = join(dir, 'filters.json');
      writeFileSync(file, '{"venue":"hip3"}');
      sdk.state.webhooks.createSubscription.mockResolvedValue(SUBSCRIPTION);
      expect(
        await runCli('webhooks', 'subscriptions', 'create', '--endpoint', ENDPOINT_ID, '--event-type', 'market.liquidation', '--filters-file', file),
      ).toBe(0);
      expect(sdk.state.webhooks.createSubscription).toHaveBeenLastCalledWith({
        endpointId: ENDPOINT_ID,
        eventType: 'market.liquidation',
        filters: { venue: 'hip3' },
      });

      expect(
        await runCli('webhooks', 'subscriptions', 'create', '--endpoint', ENDPOINT_ID, '--event-type', 'webhook.test'),
      ).toBe(0);
      expect(sdk.state.webhooks.createSubscription).toHaveBeenLastCalledWith({
        endpointId: ENDPOINT_ID,
        eventType: 'webhook.test',
      });
    });

    it.each([
      [['--filters', '{"venue":'], '--filters is not valid JSON.'],
      [['--filters', '[1,2]'], '--filters must be a JSON object, e.g. {"venue":"hyperliquid"}.'],
      [['--filters', '{}', '--filters-file', 'x.json'], 'Pass --filters or --filters-file, not both.'],
      [['--filters-file', '/nonexistent/filters.json'], 'Cannot read /nonexistent/filters.json.'],
    ])('refuses %j before any request', async (flags, message) => {
      const code = await runCli(
        'webhooks', 'subscriptions', 'create', '--endpoint', ENDPOINT_ID, '--event-type', 'market.liquidation', ...flags,
      );
      expect(code).toBe(2);
      expect(lastError().error).toBe(message);
      expect(sdk.state.webhooks.createSubscription).not.toHaveBeenCalled();
    });

    it('updates filters, the enabled switch, or both', async () => {
      sdk.state.webhooks.updateSubscription.mockResolvedValue(SUBSCRIPTION);
      expect(await runCli('webhooks', 'subscriptions', 'update', SUBSCRIPTION_ID, '--enabled', 'false')).toBe(0);
      expect(sdk.state.webhooks.updateSubscription).toHaveBeenLastCalledWith(SUBSCRIPTION_ID, { enabled: false });

      expect(
        await runCli('webhooks', 'subscriptions', 'update', SUBSCRIPTION_ID, '--filters', '{"venue":"hip3"}', '--enabled', 'true'),
      ).toBe(0);
      expect(sdk.state.webhooks.updateSubscription).toHaveBeenLastCalledWith(SUBSCRIPTION_ID, {
        filters: { venue: 'hip3' },
        enabled: true,
      });
    });

    it('refuses an update with nothing to change', async () => {
      expect(await runCli('webhooks', 'subscriptions', 'update', SUBSCRIPTION_ID)).toBe(2);
      expect(lastError().error).toBe('Nothing to update. Pass --filters, --filters-file, or --enabled.');
      expect(await runCli('webhooks', 'subscriptions', 'update', SUBSCRIPTION_ID, '--enabled', 'off')).toBe(2);
      expect(lastError().error).toBe('--enabled must be true or false (got off)');
      expect(sdk.state.webhooks.updateSubscription).not.toHaveBeenCalled();
    });

    it('deletes only with confirmation', async () => {
      expect(await runCli('webhooks', 'subscriptions', 'delete', SUBSCRIPTION_ID)).toBe(2);
      expect(sdk.state.webhooks.deleteSubscription).not.toHaveBeenCalled();
      sdk.state.webhooks.deleteSubscription.mockResolvedValue(undefined);
      expect(await runCli('webhooks', 'subscriptions', 'delete', SUBSCRIPTION_ID, '--yes')).toBe(0);
      expect(sdk.state.webhooks.deleteSubscription).toHaveBeenCalledWith(SUBSCRIPTION_ID);
      expect(stdoutJson()).toEqual({ deleted: true, subscriptionId: SUBSCRIPTION_ID });
    });

    it('resumes one subscription and prints the missed window', async () => {
      const result = {
        subscription: { ...SUBSCRIPTION, status: 'active' },
        gap: {
          pausedAt: '2026-09-28T10:00:00Z',
          resumedAt: '2026-09-28T12:00:00Z',
          replayWindow: { start: '2026-09-28T10:00:00Z', end: '2026-09-28T12:00:00Z' },
          suppressedCount: 7,
          counted: true,
          note: 'Re-read the window from the REST routes.',
        },
      };
      sdk.state.webhooks.resumeSubscription.mockResolvedValue(result);
      expect(await runCli('webhooks', 'subscriptions', 'resume', SUBSCRIPTION_ID)).toBe(0);
      expect(sdk.state.webhooks.resumeSubscription).toHaveBeenCalledWith(SUBSCRIPTION_ID);
      expect(stdoutJson()).toEqual(result);

      vi.mocked(process.stdout.write).mockClear();
      expect(await runCli('webhooks', 'subscriptions', 'resume', SUBSCRIPTION_ID, '--format', 'pretty')).toBe(0);
      expect(stdoutText()).toContain('Missed window: 2026-09-28T10:00:00Z to 2026-09-28T12:00:00Z');
      expect(stdoutText()).toContain('Suppressed matches: 7');
    });

    it('resumes every paused subscription', async () => {
      const result = { subscriptions: [], resumedCount: 0, gap: null, note: 'Nothing was paused.' };
      sdk.state.webhooks.resumeAllSubscriptions.mockResolvedValue(result);
      expect(await runCli('webhooks', 'subscriptions', 'resume-all')).toBe(0);
      expect(sdk.state.webhooks.resumeAllSubscriptions).toHaveBeenCalledWith();
      expect(stdoutJson()).toEqual(result);
    });
  });

  describe('previews', () => {
    it('estimates a rule with its configuration and window', async () => {
      const estimate = { eventType: 'market.liquidation', days: 7, total: 57, perDayP50: 8, ladder: [], basis: { mode: 'exact', note: null } };
      sdk.state.webhooks.estimate.mockResolvedValue(estimate);
      const code = await runCli(
        'webhooks', 'estimate', '--event-type', 'market.liquidation',
        '--config', '{"venue":"hyperliquid","min_notional_usd":250000}', '--lookback-days', '30',
      );
      expect(code).toBe(0);
      expect(sdk.state.webhooks.estimate).toHaveBeenCalledWith({
        eventType: 'market.liquidation',
        config: { venue: 'hyperliquid', min_notional_usd: 250000 },
        lookbackDays: 30,
      });
      expect(stdoutJson()).toEqual(estimate);
    });

    it('dry-runs a rule with its window and page size', async () => {
      const file = join(dir, 'config.json');
      writeFileSync(file, '{"venue":"hip3"}');
      const result = { eventType: 'market.liquidation', matched: 0, truncated: false, occurrences: [] };
      sdk.state.webhooks.dryRun.mockResolvedValue(result);
      const code = await runCli(
        'webhooks', 'dry-run', '--event-type', 'market.liquidation', '--config-file', file,
        '--lookback-s', '86400', '--limit', '200',
      );
      expect(code).toBe(0);
      expect(sdk.state.webhooks.dryRun).toHaveBeenCalledWith({
        eventType: 'market.liquidation',
        config: { venue: 'hip3' },
        lookbackS: 86400,
        limit: 200,
      });
      expect(stdoutJson()).toEqual(result);
    });

    it.each([
      [['webhooks', 'estimate', '--event-type', 'x', '--lookback-days', '31'], '--lookback-days must be a whole number from 1 to 30 (got 31)'],
      [['webhooks', 'dry-run', '--event-type', 'x', '--lookback-s', '59'], '--lookback-s must be a whole number from 60 to 86400 (got 59)'],
      [['webhooks', 'dry-run', '--event-type', 'x', '--limit', '0'], '--limit must be a whole number from 1 to 200 (got 0)'],
      [['webhooks', 'estimate', '--event-type', 'x', '--config', 'null'], '--config must be a JSON object, e.g. {"venue":"hyperliquid"}.'],
    ])('refuses %j before any request', async (args, message) => {
      expect(await runCli(...args)).toBe(2);
      expect(lastError().error).toBe(message);
      expect(sdk.state.webhooks.estimate).not.toHaveBeenCalled();
      expect(sdk.state.webhooks.dryRun).not.toHaveBeenCalled();
    });
  });

  describe('watched addresses', () => {
    it('lists, adds, and deletes', async () => {
      const list = { addresses: [{ id: ADDRESS_ID, address: WALLET, label: 'desk', createdAt: '2026-09-21T02:04:12Z' }], limit: 2 };
      sdk.state.webhooks.listAddresses.mockResolvedValue(list);
      expect(await runCli('webhooks', 'addresses', 'list')).toBe(0);
      expect(stdoutJson()).toEqual(list);

      sdk.state.webhooks.addAddress.mockResolvedValue(list.addresses[0]);
      expect(await runCli('webhooks', 'addresses', 'add', '--address', WALLET, '--label', 'desk')).toBe(0);
      expect(sdk.state.webhooks.addAddress).toHaveBeenCalledWith({ address: WALLET, label: 'desk' });

      sdk.state.webhooks.deleteAddress.mockResolvedValue(undefined);
      expect(await runCli('webhooks', 'addresses', 'delete', ADDRESS_ID)).toBe(2);
      expect(sdk.state.webhooks.deleteAddress).not.toHaveBeenCalled();
      expect(await runCli('webhooks', 'addresses', 'delete', ADDRESS_ID, '--yes')).toBe(0);
      expect(sdk.state.webhooks.deleteAddress).toHaveBeenCalledWith(ADDRESS_ID);
    });

    it.each([
      [['--address', '0x123'], /^--address must be a 0x-prefixed, 40 hex character wallet address/],
      [['--address', WALLET, '--label', 'x'.repeat(65)], /^--label must be at most 64 characters\.$/],
    ])('refuses %j before any request', async (flags, message) => {
      expect(await runCli('webhooks', 'addresses', 'add', ...flags)).toBe(2);
      expect(lastError().error).toMatch(message);
      expect(sdk.state.webhooks.addAddress).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    function bodyFile(): string {
      const file = join(dir, 'body.json');
      writeFileSync(file, BODY);
      return file;
    }

    function atSigningTime(offsetSeconds = 10): void {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime((T + offsetSeconds) * 1000);
    }

    it.runIf(HAS_VERIFIER)('accepts the published vector with the SDK verifier, without an API key', async () => {
      vi.stubEnv('OXA_API_KEY', '');
      atSigningTime();
      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET, '--body-file', bodyFile())).toBe(0);
      expect(stdoutJson()).toEqual({
        valid: true,
        eventId: '11111111-1111-4111-8111-111111111111',
        eventType: 'webhook.test',
        signedAt: '2025-09-19T00:00:00.000Z',
        event: JSON.parse(BODY),
      });
      expect(stdoutText()).not.toContain(SECRET);
    });

    it.runIf(HAS_VERIFIER)('accepts a rotation header with only the previous secret', async () => {
      atSigningTime();
      const code = await runCli(
        'webhooks', 'verify', '--signature', `0xa-signature: ${SIG_ROTATING}`, '--secret', PREVIOUS, '--body-file', bodyFile(),
      );
      expect(code).toBe(0);
      expect(stdoutJson().valid).toBe(true);
    });

    it.runIf(HAS_VERIFIER)('rejects a header the secret did not sign, and never prints the secret', async () => {
      atSigningTime();
      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--secret', PREVIOUS, '--body-file', bodyFile())).toBe(2);
      expect(lastError().error).toMatch(/^Signature did not verify \(no_matching_signature\): /);
      expect(stderrText()).not.toContain(PREVIOUS);
      expect(stdoutText()).toBe('');
    });

    it.runIf(HAS_VERIFIER)('enforces the replay window unless told to skip it', async () => {
      atSigningTime(3600);
      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET, '--body-file', bodyFile())).toBe(2);
      expect(lastError().error).toMatch(/^Signature did not verify \(timestamp_out_of_tolerance\): /);

      expect(
        await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET, '--body-file', bodyFile(), '--tolerance', '3600'),
      ).toBe(0);
      expect(
        await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET, '--body-file', bodyFile(), '--ignore-timestamp'),
      ).toBe(0);
    });

    it.runIf(HAS_VERIFIER)('reads the raw body from stdin and rejects a changed byte', async () => {
      atSigningTime();
      vi.spyOn(process, 'stdin', 'get').mockReturnValue(Readable.from([Buffer.from(BODY)]) as never);
      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET)).toBe(0);

      vi.spyOn(process, 'stdin', 'get').mockReturnValue(Readable.from([Buffer.from(`${BODY}\n`)]) as never);
      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET)).toBe(2);
      expect(lastError().error).toMatch(/no_matching_signature/);
    });

    it('passes the raw bytes, every secret, and the replay window to the SDK verifier', async () => {
      const calls: any[] = [];
      sdk.state.construct = async (options) => {
        calls.push(options);
        return { id: 'evt', type: 'webhook.test' };
      };
      const file = bodyFile();
      expect(
        await runCli(
          'webhooks', 'verify', '--signature', ` 0xa-signature: ${SIG}`, '--secret', SECRET, '--secret', PREVIOUS,
          '--body-file', file, '--tolerance', '60',
        ),
      ).toBe(0);
      expect(Buffer.from(calls[0].payload).toString()).toBe(BODY);
      expect(calls[0].secret).toEqual([SECRET, PREVIOUS]);
      expect(calls[0].signature).toBe(SIG);
      expect(calls[0].toleranceSeconds).toBe(60);
      expect(typeof calls[0].subtle?.sign).toBe('function');

      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET, '--body-file', file, '--ignore-timestamp')).toBe(0);
      expect(calls[1].toleranceSeconds).toBe(Number.POSITIVE_INFINITY);

      vi.mocked(process.stdout.write).mockClear();
      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET, '--body-file', file)).toBe(0);
      expect(calls[2]).not.toHaveProperty('toleranceSeconds');
      expect(stdoutJson()).toMatchObject({ valid: true, eventId: 'evt', eventType: 'webhook.test' });
    });

    it('reads the secret from OXA_WEBHOOK_SECRET', async () => {
      const calls: any[] = [];
      sdk.state.construct = async (options) => {
        calls.push(options);
        return { id: 'evt', type: 'webhook.test' };
      };
      vi.stubEnv('OXA_WEBHOOK_SECRET', SECRET);
      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--body-file', bodyFile())).toBe(0);
      expect(calls[0].secret).toEqual([SECRET]);
    });

    it('scrubs the secret from any error the verifier raises', async () => {
      sdk.state.construct = async () => {
        throw new Error(`crypto failure for key ${SECRET}`);
      };
      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET, '--body-file', bodyFile())).toBe(5);
      expect(lastError().error).toBe('crypto failure for key [secret]');
      expect(stderrText()).not.toContain(SECRET);
    });

    it.each([
      [['--signature', SIG, '--body-file', 'x'], 'A signing secret is required. Pass --secret or set OXA_WEBHOOK_SECRET.'],
      [['--signature', ' ', '--secret', SECRET, '--body-file', 'x'], '--signature is required: the 0xa-signature header value.'],
      [
        ['--signature', SIG, '--secret', SECRET, '--body-file', 'x', '--tolerance', '5', '--ignore-timestamp'],
        'Pass --tolerance or --ignore-timestamp, not both.',
      ],
      [['--signature', SIG, '--secret', SECRET, '--body-file', '/nonexistent/body.json'], 'Cannot read /nonexistent/body.json.'],
    ])('refuses %j', async (flags, message) => {
      vi.stubEnv('OXA_WEBHOOK_SECRET', '');
      sdk.state.construct = vi.fn();
      expect(await runCli('webhooks', 'verify', ...flags)).toBe(2);
      expect(lastError().error).toBe(message);
      expect(sdk.state.construct).not.toHaveBeenCalled();
    });

    it('asks for a body when stdin is a terminal', async () => {
      setTty(true);
      sdk.state.construct = vi.fn();
      expect(await runCli('webhooks', 'verify', '--signature', SIG, '--secret', SECRET)).toBe(2);
      expect(lastError().error).toBe('Pass the raw delivery body with --body-file <path>, or pipe it on stdin.');
    });
  });
});
