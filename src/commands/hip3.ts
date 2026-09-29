// `oxa hip3 oracle ...`: oracle reads for HIP-3 builder markets. Symbols keep
// their builder prefix and case (e.g. km:US500).

import { resolveApiKey, createClient } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyField, EXIT } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { getHip3OracleResource } from '../lib/sdk.js';
import { cell, emitDocument, field, isoTime } from '../lib/emit.js';

interface Hip3Options {
  apiKey?: string;
  format: string;
}

export async function hip3OracleExternalPrice(symbol: string, options: Hip3Options): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  const oracle = getHip3OracleResource(client);
  try {
    const price = await oracle.externalPrice(symbol);
    emitDocument(price, { format }, () => {
      prettyHeader(`${symbol} External Price (HIP-3 oracle)`);
      prettyField('External price', cell(field(price, 'externalPrice', 'external_price') ?? null));
      prettyField('Mark price', cell(field(price, 'markPrice', 'mark_price') ?? null));
      prettyField('Block', field(price, 'blockNumber', 'block_number') as number | undefined);
      prettyField('Time', isoTime(field(price, 'timestamp')));
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}

export async function hip3OracleDiscoveryBounds(symbol: string, options: Hip3Options): Promise<void> {
  const format = validateFormat(options.format);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  const oracle = getHip3OracleResource(client);
  try {
    const bounds = await oracle.discoveryBounds(symbol);
    emitDocument(bounds, { format }, () => {
      prettyHeader(`${symbol} Discovery Bounds (HIP-3 oracle)`);
      prettyField('Lower bound', field(bounds, 'lowerBound', 'lower_bound') as number | undefined);
      prettyField('Upper bound', field(bounds, 'upperBound', 'upper_bound') as number | undefined);
      prettyField('Reference price', field(bounds, 'referencePrice', 'reference_price') as number | undefined);
      prettyField('Reference source', field(bounds, 'referenceSource', 'reference_source') as string | undefined);
      prettyField('Max leverage', field(bounds, 'maxLeverage', 'max_leverage') as number | undefined);
      prettyField('Bound fraction', field(bounds, 'boundFraction', 'bound_fraction') as number | undefined);
      prettyField('Block', field(bounds, 'blockNumber', 'block_number') as number | undefined);
      prettyField('Time', isoTime(field(bounds, 'timestamp')));
    });
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
