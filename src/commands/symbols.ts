// `oxa symbols`: the public symbol universe across every venue family, with
// coverage dates and data types. The API returns the whole list in one
// response (every HIP-4 outcome side is an entry); --exchange and --symbol
// filter it locally.

import { resolveApiKey, createClient } from '../lib/client.js';
import { validateFormat, prettyHeader, prettyTable, prettyDim, EXIT, outputJson, prettyField } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { writeOutputFile } from '../lib/file.js';
import { parseChoice } from '../lib/params.js';
import { getSymbolsResource } from '../lib/sdk.js';
import { cell, field } from '../lib/emit.js';

/** Venue families in the symbol list (`exchange` on each entry). */
export const SYMBOL_EXCHANGES = ['hyperliquid', 'hip3', 'hip4', 'spot', 'lighter', 'rh-lighter'] as const;

const PRETTY_ROWS = 100;

interface SymbolsOptions {
  exchange?: string;
  symbol?: string;
  out?: string;
  apiKey?: string;
  format: string;
}

/** Keep entries matching --exchange and --symbol. A bare HIP-4 number also matches `#<n>`. */
export function filterSymbols(entries: unknown[], exchange?: string, symbol?: string): unknown[] {
  return entries.filter((entry) => {
    const entryExchange = field(entry, 'exchange');
    if (exchange !== undefined && entryExchange !== exchange) return false;
    if (symbol === undefined) return true;
    const entrySymbol = field(entry, 'symbol');
    return entrySymbol === symbol || (entryExchange === 'hip4' && entrySymbol === `#${symbol}`);
  });
}

export async function symbolsCommand(options: SymbolsOptions): Promise<void> {
  const format = validateFormat(options.format);
  const exchange = parseChoice(options.exchange, 'exchange', SYMBOL_EXCHANGES);
  const apiKey = resolveApiKey(options.apiKey);
  const client = createClient(apiKey);

  const symbols = getSymbolsResource(client);
  try {
    const all = await symbols.list();
    const entries = filterSymbols(Array.isArray(all) ? all : [], exchange, options.symbol);

    if (options.out) {
      writeOutputFile(options.out, entries);
      const summary = {
        written_to: options.out,
        records: entries.length,
        ...(exchange ? { exchange } : {}),
        ...(options.symbol ? { symbol: options.symbol } : {}),
      };
      if (format === 'pretty') {
        prettyHeader(`Written to ${options.out}`);
        prettyField('Symbols', entries.length);
        process.stdout.write('\n');
      } else {
        outputJson(summary);
      }
    } else if (format === 'pretty') {
      prettyHeader(`Symbols${exchange ? ` (${exchange})` : ''}, ${entries.length} entries`);
      if (entries.length === 0) {
        prettyDim('No symbols match.');
      } else {
        const shown = entries.slice(0, PRETTY_ROWS);
        prettyTable(
          ['Exchange', 'Symbol', 'Coverage From', 'Coverage To', 'Data Types'],
          shown.map((s) => {
            const types = field(s, 'dataTypes', 'data_types');
            return [
              cell(field(s, 'exchange')),
              cell(field(s, 'symbol')),
              cell(field(s, 'coverageFrom', 'coverage_from')),
              cell(field(s, 'coverageTo', 'coverage_to')),
              Array.isArray(types) ? types.join(', ') : '-',
            ];
          }),
        );
        if (entries.length > shown.length) {
          prettyDim(`... and ${entries.length - shown.length} more (narrow with --exchange or --symbol, or use --format json)`);
        }
      }
      process.stdout.write('\n');
    } else {
      outputJson(entries);
    }
    process.exit(EXIT.SUCCESS);
  } catch (error) {
    handleError(error, apiKey);
  }
}
