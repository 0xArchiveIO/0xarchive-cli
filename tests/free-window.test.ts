import { OxArchiveError } from '@0xarchive/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorFields } from '../src/lib/errors.js';
import { transformKeys } from '../src/lib/http.js';
import { exampleRange } from '../src/lib/time.js';

// From 2026-11-23, after an account's first 30 days, Free data runs through
// yesterday (UTC). A request that reaches into today is refused with this body.
const TODAY_BODY = {
  success: false,
  code: 403,
  error_code: 'forbidden',
  reason: 'today_needs_build',
  data_ends_on: '2026-11-22',
  required_plans: ['build', 'pro', 'scale', 'enterprise'],
  upgrade_url: 'https://0xarchive.io/pricing',
  error:
    "Free data runs through yesterday: the latest instant Free serves is 2026-11-22T23:59:59.999Z. Today's data and live streams need Build. Upgrade at https://0xarchive.io/pricing.",
  request_id: 'req-today',
};

function sdkError(asPlanRequiredError: boolean): OxArchiveError {
  // The SDK camelCases the body; 1.14 and later also set the plan fields as
  // properties (PlanRequiredError).
  const camel = transformKeys(TODAY_BODY) as Record<string, any>;
  const error = new OxArchiveError(camel.error, 403, camel.requestId, camel.errorCode, { body: camel });
  return asPlanRequiredError
    ? Object.assign(error, { requiredPlans: camel.requiredPlans, upgradeUrl: camel.upgradeUrl })
    : error;
}

describe("a Free refusal of today's data", () => {
  it.each([true, false])('names the reason and the last day served (PlanRequiredError: %s)', (asPlanRequiredError) => {
    expect(apiErrorFields(sdkError(asPlanRequiredError))).toEqual({
      error_code: 'forbidden',
      request_id: 'req-today',
      status: 403,
      param: undefined,
      valid_values: undefined,
      datatype: undefined,
      reason: 'today_needs_build',
      data_ends_on: '2026-11-22',
      required_plans: ['build', 'pro', 'scale', 'enterprise'],
      upgrade_url: 'https://0xarchive.io/pricing',
    });
  });

  it('adds no reason to an error that is not a plan refusal', () => {
    const camel = transformKeys({ ...TODAY_BODY, required_plans: undefined }) as Record<string, any>;
    const fields = apiErrorFields(new OxArchiveError(camel.error, 403, camel.requestId, camel.errorCode, { body: camel }));
    expect(fields.reason).toBeUndefined();
    expect(fields.data_ends_on).toBeUndefined();
  });
});

describe('usage example ranges', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('open at midnight UTC yesterday and end before midnight UTC today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T10:15:00Z'));
    expect(exampleRange(1)).toBe('--start 2026-11-22T00:00:00Z --end 2026-11-22T01:00:00Z');
    expect(exampleRange(24)).toBe('--start 2026-11-22T00:00:00Z --end 2026-11-22T23:59:59Z');
  });
});
