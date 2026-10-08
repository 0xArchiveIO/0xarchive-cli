import { Command } from 'commander';
import { authTestCommand } from './commands/auth.js';
import { orderbookGetCommand, orderbookHistoryCommand } from './commands/orderbook.js';
import { tradesFetchCommand } from './commands/trades.js';
import { freshnessCommand } from './commands/freshness.js';
import { candlesCommand } from './commands/candles.js';
import { fundingCurrentCommand, fundingHistoryCommand } from './commands/funding.js';
import { oiCurrentCommand, oiHistoryCommand } from './commands/openinterest.js';
import { instrumentsCommand } from './commands/instruments.js';
import {
  liquidationsCommand,
  liquidationsVolumeCommand,
  liquidationsUserCommand,
  liquidationsLevelsCommand,
  liquidationsLevelsHistoryCommand,
} from './commands/liquidations.js';
import { summaryCommand } from './commands/summary.js';
import { pricesCommand } from './commands/prices.js';
import {
  ordersHistoryCommand,
  ordersFlowCommand,
  ordersTpslCommand,
  ordersTriggerLevelsCommand,
  ordersTriggerLevelsHistoryCommand,
} from './commands/orders.js';
import { l4GetCommand, l4DiffsCommand, l4HistoryCommand } from './commands/l4.js';
import { l2GetCommand, l2HistoryCommand, l2DiffsCommand } from './commands/l2.js';
import { l3GetCommand, l3HistoryCommand } from './commands/l3.js';
import { outcomesListCommand, outcomesGetCommand, outcomesBySlugCommand } from './commands/outcomes.js';
import {
  hip4OrderbookGet,
  hip4OrderbookHistory,
  hip4Trades,
  hip4Candles,
  hip4Instruments,
  hip4OiCurrent,
  hip4OiHistory,
  hip4Summary,
  hip4Freshness,
  hip4Prices,
  hip4OrdersHistory,
  hip4OrdersFlow,
  hip4OrdersTpsl,
  hip4L4Get,
  hip4L4Diffs,
  hip4L4History,
  hip4OutcomesList,
  hip4OutcomesGet,
  hip4QuestionsList,
  hip4QuestionsGet,
} from './commands/hip4.js';
import { hip3OracleExternalPrice, hip3OracleDiscoveryBounds } from './commands/hip3.js';
import { breadthCurrentCommand, breadthHistoryCommand } from './commands/breadth.js';
import { cvdCommand } from './commands/cvd.js';
import { walletsClassifyCommand, WALLET_SORTS } from './commands/wallets.js';
import { symbolsCommand } from './commands/symbols.js';
import {
  dataQualityStatusCommand,
  dataQualityCoverageCommand,
  dataQualityIncidentsCommand,
  dataQualityIncidentCommand,
  dataQualityLatencyCommand,
  dataQualitySlaCommand,
  dataQualityPositionsFreshnessCommand,
  INCIDENT_STATUSES,
} from './commands/data-quality.js';
import { streamReplayCommand } from './commands/replay.js';
import {
  webhooksEventTypesCommand,
  webhooksLimitsCommand,
  webhooksEndpointsListCommand,
  webhooksEndpointsCreateCommand,
  webhooksEndpointsDeleteCommand,
  webhooksEndpointsEnableCommand,
  webhooksEndpointsRotateSecretCommand,
  webhooksEndpointsTestCommand,
  webhooksEndpointsDeliveriesCommand,
  webhooksRedeliverCommand,
  webhooksSubscriptionsListCommand,
  webhooksSubscriptionsCreateCommand,
  webhooksSubscriptionsUpdateCommand,
  webhooksSubscriptionsDeleteCommand,
  webhooksSubscriptionsResumeCommand,
  webhooksSubscriptionsResumeAllCommand,
  webhooksEstimateCommand,
  webhooksDryRunCommand,
  webhooksAddressesListCommand,
  webhooksAddressesAddCommand,
  webhooksAddressesDeleteCommand,
  webhooksVerifyCommand,
} from './commands/webhooks.js';
import {
  streamLiquidationsCommand,
  streamTradesCommand,
  streamOrderbookCommand,
  streamGenericCommand,
} from './commands/stream.js';
import {
  spotPairsList,
  spotPairGet,
  spotCandles,
  spotOrderbookGet,
  spotTrades,
  spotL4Get,
  spotL4Diffs,
  spotL4History,
  spotOrdersHistory,
  spotTwapBySymbol,
  spotTwapByUser,
  spotFreshness,
} from './commands/spot.js';
import {
  positionsGetCommand,
  positionsHistoryCommand,
  positionsChangesCommand,
  positionsMarketCommand,
  positionsSummaryCommand,
  positionsAllCommand,
  accountGetCommand,
  accountHistoryCommand,
  accountsByL1Command,
} from './commands/positions.js';
import { capabilitiesCommand } from './commands/capabilities.js';
import { exitError, EXIT } from './lib/output.js';

const VERSION = '1.11.0';

const EXCHANGE_DESC =
  'Exchange: hyperliquid, hip3, hip4, lighter, or rh-lighter. ' +
  'lighter is Lighter mainnet and rh-lighter is Lighter on Robinhood Chain (USDG-quoted; spot symbols are dashed, e.g. AAPL-USDG). ' +
  'For hip4, coins are bare numerics (e.g. "0", "1", "42"); legacy "#0" / "%230" forms are also accepted. mark_price is an implied probability (0..1), not a USD price.';

// Commands that also serve Hyperliquid Spot take `--exchange spot` too.
const VENUE_DESC =
  'Exchange: hyperliquid, hip3, hip4, spot, lighter, or rh-lighter. ' +
  'spot is Hyperliquid Spot (dashed symbols, e.g. HYPE-USDC); lighter is Lighter mainnet and rh-lighter is Lighter on Robinhood Chain (USDG-quoted; spot symbols are dashed, e.g. AAPL-USDG). ' +
  'For hip4, coins are bare numerics (e.g. "0", "1", "42"); legacy "#0" / "%230" forms are also accepted. mark_price is an implied probability (0..1), not a USD price.';

const HL_EXCHANGE_DESC = 'Exchange: hyperliquid or hip3';

const SIDE_DESC = 'Keep one taker side: buy or sell (filtered by the API, so a full page holds --limit matching trades)';

const LEVEL_RANGE_DESC = 'Percentage range around the mid price, 1 to 50 (default 10)';
const LEVEL_BUCKETS_DESC = 'Number of price buckets, 10 to 200 (default 50)';
const LEVEL_SIDE_DESC = 'Keep one side: bid, buy, or B (longs / bids); ask, sell, or A (shorts / asks)';

/** Repeatable string option: --secret a --secret b. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const POSITIONS_EXCHANGE_DESC =
  'Exchange: hyperliquid, hip3, lighter (Lighter mainnet), or rh-lighter (Lighter on Robinhood Chain)';

// The command tree. `src/bin.ts` parses process.argv with it; tests import it
// to parse argument vectors directly.
export const program = new Command()
  .name('oxa')
  .description('0xArchive CLI: historical and live market data for Hyperliquid and Lighter')
  .version(VERSION);

// Route unknown commands to stderr with exit code 2
program.on('command:*', (operands: string[]) => {
  exitError(
    `Unknown command "${operands[0]}". Run "oxa --help" for available commands.`,
    EXIT.VALIDATION,
  );
});

// ── oxa auth test ───────────────────────────────────────────────────────

const auth = program
  .command('auth')
  .description('Authentication commands');

auth
  .command('test')
  .description('Verify your API key is valid')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--exchange <exchange>', 'Exchange to check against', 'hyperliquid')
  .option('--symbol <symbol>', 'Symbol to use for the check', 'BTC')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(authTestCommand);

// ── oxa capabilities ────────────────────────────────────────────────────

program
  .command('capabilities')
  .description(
    'What each venue serves: REST routes, WebSocket channels (live and replay), first served instant, cadence, page limit, and intervals. No API key needed.',
  )
  .option('--exchange <venue>', 'Keep one venue: hyperliquid, hip3, hip4, spot, lighter, or rh-lighter')
  .option('--datatype <datatype>', 'Keep one datatype, e.g. trades, l4_diffs, oi (with --exchange, the full row)')
  .option('--api-key <key>', 'API key (optional; or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty (table)', 'json')
  .action(capabilitiesCommand);

// ── oxa orderbook get ───────────────────────────────────────────────────

const orderbook = program
  .command('orderbook')
  .description('Orderbook commands');

orderbook
  .command('get')
  .description('Get an orderbook snapshot')
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(orderbookGetCommand);

orderbook
  .command('history')
  .description('Get historical orderbook snapshots over a time range')
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--depth <n>', 'Number of price levels per side (every venue)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(orderbookHistoryCommand);

// ── oxa trades history (also: oxa trades fetch) ────────────────────────

const trades = program
  .command('trades')
  .description('Trade history commands');

trades
  .command('history')
  .alias('fetch')
  .description(
    'Fetch trade history over --start/--end, or the most recent trades without a range (every venue except hyperliquid)',
  )
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .option('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--side <side>', SIDE_DESC)
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(tradesFetchCommand);

// ── oxa candles history (also: oxa candles) ─────────────────────────────

program
  .command('candles')
  .description('OHLCV candles (Hyperliquid, HIP-3, HIP-4, Spot, and both Lighter deployments)')
  .command('history', { isDefault: true })
  .description('Get OHLCV candles over a time range ("oxa candles --exchange ..." runs this command)')
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Candle interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w', '1h')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(candlesCommand);

// ── oxa breadth current / history ───────────────────────────────────────

const breadth = program
  .command('breadth')
  .description('Market breadth above the current UTC-session VWAP (Hyperliquid and HIP-3)');

breadth
  .command('current')
  .description('Get the latest breadth snapshot. valuePct is null when no instrument is eligible, never 0.')
  .requiredOption('--exchange <exchange>', HL_EXCHANGE_DESC)
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(breadthCurrentCommand);

breadth
  .command('history')
  .description('Get breadth snapshots in ascending order. Downsampling keeps the last snapshot in each bucket.')
  .requiredOption('--exchange <exchange>', HL_EXCHANGE_DESC)
  .option('--start <time>', 'Start time (ISO 8601 or Unix ms); defaults to the route window')
  .option('--end <time>', 'End time (ISO 8601 or Unix ms); defaults to now')
  .option('--interval <interval>', 'Downsampling interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Snapshots per page, 1 to 1000')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(breadthHistoryCommand);

// ── oxa cvd history (also: oxa cvd <symbol>) ───────────────────────────

program
  .command('cvd')
  .description('Cumulative volume delta (Hyperliquid and HIP-3)')
  .command('history [symbol]', { isDefault: true })
  .description(
    'Get cumulative volume delta: taker buy and sell notional per bucket, the delta, and a running total that restarts on every page ("oxa cvd <symbol>" runs this command)',
  )
  .requiredOption('--exchange <exchange>', HL_EXCHANGE_DESC)
  .option('--symbol <symbol>', 'Coin symbol (e.g. BTC, xyz:TSLA); or pass it as the first argument')
  .option('--start <time>', 'Start time (ISO 8601 or Unix ms). Without it: the newest buckets of the 24 hours before --end')
  .option('--end <time>', 'End time (ISO 8601 or Unix ms); defaults to now')
  .option('--interval <interval>', 'Bucket width: 1m, 5m, 15m, 30m, 1h (default), 4h, 1d, 1w')
  .option('--limit <n>', 'Buckets per page, 1 to 10000 (default 500)')
  .option('--cursor <cursor>', 'Pagination cursor from previous response (same --start, --end and --interval)')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(cvdCommand);

// ── oxa funding current / history ───────────────────────────────────────

const funding = program
  .command('funding')
  .description('Funding rate data (core Hyperliquid ~1m; Lighter/HIP-3 ~10s; unavailable on HIP-4)');

funding
  .command('current')
  .description('Get current funding rate')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(fundingCurrentCommand);

funding
  .command('history')
  .description('Get funding rate history')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(fundingHistoryCommand);

// ── oxa oi current / history ────────────────────────────────────────────

const oi = program
  .command('oi')
  .description('Open interest data (HIP-4 ~10s from 2026-05-02; Lighter ~10s)');

oi
  .command('current')
  .description('Get current open interest')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(oiCurrentCommand);

oi
  .command('history')
  .description('Get open interest history')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(oiHistoryCommand);

// ── oxa instruments ─────────────────────────────────────────────────────

program
  .command('instruments')
  .description('Instruments per venue')
  .command('list', { isDefault: true })
  .description('List available instruments (Spot lists its pairs); "oxa instruments --exchange ..." runs this command')
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(instrumentsCommand);

// ── oxa symbols ─────────────────────────────────────────────────────────

program
  .command('symbols')
  .description('The public symbol universe across every venue')
  .command('list', { isDefault: true })
  .description('List the public symbol universe with coverage dates and data types, across every venue ("oxa symbols" runs this command)')
  .option('--exchange <exchange>', 'Keep one venue family: hyperliquid, hip3, hip4, spot, lighter, or rh-lighter')
  .option('--symbol <symbol>', 'Keep one symbol (exact match; a bare HIP-4 number also matches #<n>)')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(symbolsCommand);

// ── oxa liquidations history / volume / user ────────────────────────────

const liquidations = program
  .command('liquidations')
  .description('Liquidation data (Hyperliquid, HIP-3, and both Lighter deployments)');

liquidations
  .command('history')
  .description(
    'Get liquidation history (Lighter mainnet from 2026-06-10; Lighter on Robinhood Chain from 2026-06-26 20:10:26 UTC, ' +
      'with rows before 2026-08-22 backfilled from the venue\'s finalized export: source "bucket", empty rawJson)',
  )
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(liquidationsCommand);

liquidations
  .command('volume')
  .description(
    'Get pre-aggregated liquidation volume in time buckets (Lighter buckets carry a total and a count, no long/short split)',
  )
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d', '1h')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(liquidationsVolumeCommand);

liquidations
  .command('user')
  .description('Get liquidations for a specific user address (Hyperliquid only)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--user <address>', 'User wallet address (e.g. 0x1234...)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--coin <coin>', 'Filter by coin symbol')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(liquidationsUserCommand);

liquidations
  .command('levels')
  .description(
    'Get projected forced-liquidation levels around the mark price (Hyperliquid and HIP-3; snapshots about every 5 minutes, history from 2026-07-27)',
  )
  .requiredOption('--exchange <exchange>', HL_EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, xyz:TSLA)')
  .option('--range-pct <n>', LEVEL_RANGE_DESC)
  .option('--buckets <n>', LEVEL_BUCKETS_DESC)
  .option('--side <side>', LEVEL_SIDE_DESC)
  .option('--at <time>', 'Point-in-time read (ISO 8601 or Unix ms): the newest snapshot at or before it')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(liquidationsLevelsCommand);

liquidations
  .command('levels-history')
  .description('Get liquidation-levels snapshots over a time range, oldest first (Hyperliquid and HIP-3)')
  .requiredOption('--exchange <exchange>', HL_EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, xyz:TSLA)')
  .option('--start <time>', 'Start time (ISO 8601 or Unix ms); defaults to 24 hours before --end')
  .option('--end <time>', 'End time (ISO 8601 or Unix ms); defaults to now')
  .option('--summary', 'List snapshots without their price buckets')
  .option('--range-pct <n>', LEVEL_RANGE_DESC)
  .option('--buckets <n>', LEVEL_BUCKETS_DESC)
  .option('--side <side>', LEVEL_SIDE_DESC)
  .option('--limit <n>', 'Snapshots per page, 1 to 100 (default 24)')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(liquidationsLevelsHistoryCommand);

// ── oxa summary ─────────────────────────────────────────────────────────

program
  .command('summary')
  .description('Market summary per symbol')
  .command('get', { isDefault: true })
  .description('Get market summary (price, funding, OI, volume) in one call ("oxa summary --exchange ..." runs this command)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(summaryCommand);

// ── oxa prices ──────────────────────────────────────────────────────────

program
  .command('prices')
  .description('Mark, oracle, and mid price history')
  .command('history', { isDefault: true })
  .description('Get mark/oracle/mid price history ("oxa prices --exchange ..." runs this command)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(pricesCommand);

// ── oxa freshness ───────────────────────────────────────────────────────

program
  .command('freshness')
  .description('Data freshness per symbol')
  .command('get', { isDefault: true })
  .description('Check data freshness for a symbol ("oxa freshness --exchange ..." runs this command)')
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(freshnessCommand);

// ── oxa data-quality ... ────────────────────────────────────────────────

const dataQuality = program
  .command('data-quality')
  .description('Data quality: platform status, coverage and gaps, incidents, latency, SLA, and positions freshness');

dataQuality
  .command('status')
  .description('Overall status, with status and latency per venue and 24h completeness per data type')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(dataQualityStatusCommand);

dataQuality
  .command('coverage')
  .description('Coverage for every venue, one venue (--exchange), or one symbol with gaps and cadence (--exchange and --symbol)')
  .option('--exchange <exchange>', 'hyperliquid, hip3, hip4, spot, lighter, or rh-lighter')
  .option('--symbol <symbol>', 'Symbol as the venue names it (BTC, km:US500, HYPE-USDC, #0); needs --exchange')
  .option('--from <time>', 'With --symbol: start of the gap search (ISO 8601 or Unix ms); default 30 days ago')
  .option('--to <time>', 'With --symbol: end of the gap search (ISO 8601 or Unix ms); default now')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(dataQualityCoverageCommand);

dataQuality
  .command('incidents')
  .description('List data incidents, newest first, with offset paging')
  .option('--status <status>', `Filter by status: ${INCIDENT_STATUSES.join(', ')}`)
  .option('--exchange <exchange>', 'Filter by venue: hyperliquid, hip3, hip4, spot, lighter, or rh-lighter')
  .option('--since <time>', 'Only incidents that started after this time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Incidents per page, 1 to 100 (default 20)')
  .option('--offset <n>', 'Page offset (default 0)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(dataQualityIncidentsCommand);

dataQuality
  .command('incident <incident_id>')
  .description('Get one incident with its root cause, resolution, and records affected and recovered')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(dataQualityIncidentCommand);

dataQuality
  .command('latency')
  .description('Current WebSocket and REST latency and data lag per venue')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(dataQualityLatencyCommand);

dataQuality
  .command('sla')
  .description('SLA targets and actual uptime, completeness, and p99 latency for one month (default the current month)')
  .option('--year <yyyy>', 'Year')
  .option('--month <m>', 'Month, 1 to 12')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(dataQualitySlaCommand);

dataQuality
  .command('positions-freshness')
  .description('Freshness of the account positions data per venue: live and hourly snapshots, staleness, built and finalized through')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(dataQualityPositionsFreshnessCommand);

// ── oxa orders history / flow / tpsl ────────────────────────────────────

const orders = program
  .command('orders')
  .description('Order history and flow commands');

orders
  .command('history')
  .description('Get order history with user attribution (hyperliquid, hip3, hip4, and spot; spot takes the range and cursor only)')
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--user <address>', 'Filter by user wallet address')
  .option('--status <status>', 'Filter by status: open, filled, cancelled, expired')
  .option('--order-type <type>', 'Filter by type: limit, market, trigger, tpsl')
  .option('--triggered <bool>', 'true keeps only trigger events; false leaves them out')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(ordersHistoryCommand);

orders
  .command('flow')
  .description('Get order flow aggregation')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Bucket width: 1m, 5m, 15m, 1h', '1h')
  .option('--limit <n>', 'Buckets per page (default 1000, max 10000)')
  .option('--cursor <cursor>', 'Pagination cursor from previous response (same --start, --end and --interval)')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(ordersFlowCommand);

orders
  .command('tpsl')
  .description('Get TP/SL order history')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--user <address>', 'Filter by user wallet address')
  .option('--triggered <bool>', 'Filter by triggered status: true or false')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(ordersTpslCommand);

orders
  .command('trigger-levels')
  .description(
    'Get pending stop-loss and take-profit trigger orders grouped into price buckets (Hyperliquid and HIP-3)',
  )
  .requiredOption('--exchange <exchange>', HL_EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, xyz:TSLA)')
  .option('--range-pct <n>', LEVEL_RANGE_DESC)
  .option('--buckets <n>', LEVEL_BUCKETS_DESC)
  .option('--side <side>', LEVEL_SIDE_DESC)
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(ordersTriggerLevelsCommand);

orders
  .command('trigger-levels-history')
  .description('Get trigger-levels snapshots over a time range, oldest first (15-minute cadence from 2026-07-27)')
  .requiredOption('--exchange <exchange>', HL_EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, xyz:TSLA)')
  .option('--start <time>', 'Start time (ISO 8601 or Unix ms); defaults to 24 hours before --end')
  .option('--end <time>', 'End time (ISO 8601 or Unix ms); defaults to now')
  .option('--summary', 'List snapshots without their price buckets')
  .option('--range-pct <n>', LEVEL_RANGE_DESC)
  .option('--buckets <n>', LEVEL_BUCKETS_DESC)
  .option('--side <side>', LEVEL_SIDE_DESC)
  .option('--limit <n>', 'Snapshots per page, 1 to 100 (default 24)')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(ordersTriggerLevelsHistoryCommand);

// ── oxa l4 get / diffs / history ────────────────────────────────────────

const l4 = program
  .command('l4')
  .description('L4 order-level orderbook commands');

l4
  .command('get')
  .description('Get L4 orderbook reconstruction at a timestamp')
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms or ISO 8601)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l4GetCommand);

l4
  .command('diffs')
  .description('Get L4 orderbook diffs')
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l4DiffsCommand);

l4
  .command('history')
  .description('Get L4 orderbook checkpoints')
  .requiredOption('--exchange <exchange>', VENUE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l4HistoryCommand);

// ── oxa l2 get / history / diffs ────────────────────────────────────────

const l2 = program
  .command('l2')
  .description('L2 all-level orderbook commands derived from L4 data');

l2
  .command('get')
  .description('Get an L2 all-level orderbook at a timestamp')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms or ISO 8601)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l2GetCommand);

l2
  .command('history')
  .description('Get L2 all-level orderbook checkpoints (every checkpoint carries the full book unless --depth caps it)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l2HistoryCommand);

l2
  .command('diffs')
  .description('Get L2 tick-level orderbook diffs')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l2DiffsCommand);

// ── oxa lighter l3 get / history (also: oxa l3 ...) ────────────────────
// L3 is served on Lighter mainnet only, so it sits under the venue. The
// top-level `oxa l3` group is kept with the same commands.

const L3_DESC =
  'Lighter mainnet L3 order-level orderbook commands, max 250 orders per side (Lighter on Robinhood Chain has no L3)';

function addL3Commands(group: Command): void {
  group
    .command('get')
    .description('Get Lighter L3 orderbook snapshot')
    .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH)')
    .option('--timestamp <time>', 'Historical snapshot time (ISO 8601 or Unix ms); latest when omitted')
    .option('--depth <n>', 'Maximum orders per side (Lighter cap: 250)')
    .option('--account <index>', 'Only the orders owned by this Lighter account index')
    .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
    .option('--format <format>', 'Output format: json or pretty', 'json')
    .action(l3GetCommand);

  group
    .command('history')
    .description('Get historical Lighter L3 orderbook snapshots (up to 250 orders per side each)')
    .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH)')
    .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
    .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
    .option('--account <index>', 'Only the orders owned by this Lighter account index')
    .option('--limit <n>', 'Maximum records to return')
    .option('--cursor <cursor>', 'Pagination cursor from previous response')
    .option('--out <path>', 'Write JSON output to file')
    .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
    .option('--format <format>', 'Output format: json or pretty', 'json')
    .action(l3HistoryCommand);
}

addL3Commands(program.command('l3').description(L3_DESC));

// ── oxa outcomes (HIP-4 only) ───────────────────────────────────────────

const outcomes = program
  .command('outcomes')
  .description('HIP-4 outcome markets (binary outcome metadata)');

outcomes
  .command('list')
  .description('List HIP-4 outcome markets with optional settled filter')
  .option('--settled <state>', 'Filter: true, false, or all', 'all')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(outcomesListCommand);

outcomes
  .command('get <outcome_id>')
  .description('Get a single HIP-4 outcome market detail (includes aggregated_oi)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action((outcomeId: string, options: { apiKey?: string; format: string }) =>
    outcomesGetCommand({ outcomeId, ...options }),
  );

outcomes
  .command('by-slug <slug>')
  .description('Get a HIP-4 outcome market by its outcome slug or either side\'s slug (includes aggregatedOi)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(outcomesBySlugCommand);

// ── oxa hip4 ────────────────────────────────────────────────────────────
// Explicit HIP-4 command surface. Coins are bare numerics (e.g. `0`, `1`).
// HIP-4 has no funding or liquidations by design; candles and per-side OI are
// available through their dedicated routes.

const hip4 = program
  .command('hip4')
  .description(
    'HIP-4 outcome markets (binary prediction markets). Coins are bare numerics, e.g. "0", "1". ' +
      'Outcomes and questions live here; shared datatypes also take --exchange hip4.',
  );

const hip4Outcomes = hip4
  .command('outcomes')
  .description('HIP-4 outcome metadata');

hip4Outcomes
  .command('list')
  .description('List HIP-4 outcome markets')
  .option('--settled <state>', 'Filter: true, false, or all', 'all')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OutcomesList);

hip4Outcomes
  .command('get <outcome_id>')
  .description('Get a single HIP-4 outcome market detail (includes aggregated_oi)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action((outcomeId: string, options: { apiKey?: string; format: string }) =>
    hip4OutcomesGet(outcomeId, options),
  );

hip4Outcomes
  .command('by-slug <slug>')
  .description('Get a HIP-4 outcome market by its outcome slug or either side\'s slug (includes aggregatedOi)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(outcomesBySlugCommand);

const hip4Questions = hip4
  .command('questions')
  .description('HIP-4 questions: binary outcomes grouped under one ballot, with a fallback outcome');

hip4Questions
  .command('list')
  .description('List HIP-4 questions, one page at a time')
  .option('--limit <n>', 'Questions per page, 1 to 1000 (default 100)')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4QuestionsList);

hip4Questions
  .command('get <question_id>')
  .description('Get one HIP-4 question: its named outcomes, fallback outcome, and settled outcomes')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action((questionId: string, options: { apiKey?: string; format: string }) =>
    hip4QuestionsGet(questionId, options),
  );

hip4
  .command('instruments')
  .description('List HIP-4 instruments (one row per outcome side)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4Instruments);

const hip4Orderbook = hip4
  .command('orderbook')
  .description('HIP-4 L2 orderbook commands');

hip4Orderbook
  .command('get <coin>')
  .description('Get current HIP-4 L2 orderbook (e.g. "oxa hip4 orderbook get 0")')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OrderbookGet);

hip4Orderbook
  .command('history <coin>')
  .description('Get historical HIP-4 L2 orderbook snapshots')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OrderbookHistory);

hip4
  .command('trades <coin>')
  .description('Get HIP-4 trades (e.g. "oxa hip4 trades 0 --recent" or "oxa hip4 trades 0 --start ... --end ...")')
  .option('--recent', 'Fetch the most recent trades (omit --start / --end)')
  .option('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .option('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--side <side>', SIDE_DESC)
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4Trades);

hip4
  .command('candles <coin>')
  .description('Get HIP-4 OHLCV candles')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Candle interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w', '1h')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4Candles);

const hip4Oi = hip4
  .command('oi')
  .description('HIP-4 open interest commands (per-side, ~10s from 2026-05-02; mark_price is probability 0..1)');

hip4Oi
  .command('current <coin>')
  .description('Get current HIP-4 open interest for a coin')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OiCurrent);

hip4Oi
  .command('history <coin>')
  .description('Get HIP-4 open interest history for a coin')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OiHistory);

hip4
  .command('summary <coin>')
  .description('Get HIP-4 24h summary (probability, volume, OI)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4Summary);

hip4
  .command('freshness <coin>')
  .description('Check HIP-4 data freshness for a coin')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4Freshness);

hip4
  .command('prices <coin>')
  .description('Get HIP-4 implied-probability history (mark/oracle/mid in [0,1])')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4Prices);

const hip4Orders = hip4
  .command('orders')
  .description('HIP-4 order history / flow / TP-SL');

hip4Orders
  .command('history <coin>')
  .description('Get HIP-4 order history with user attribution')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--user <address>', 'Filter by user wallet address')
  .option('--status <status>', 'Filter by status: open, filled, cancelled, expired')
  .option('--order-type <type>', 'Filter by type: limit, market, trigger, tpsl')
  .option('--triggered <bool>', 'true keeps only trigger events; false leaves them out')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OrdersHistory);

hip4Orders
  .command('flow <coin>')
  .description('Get HIP-4 order flow aggregation')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Bucket width: 1m, 5m, 15m, 1h', '1h')
  .option('--limit <n>', 'Buckets per page (default 1000, max 10000)')
  .option('--cursor <cursor>', 'Pagination cursor from previous response (same --start, --end and --interval)')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OrdersFlow);

hip4Orders
  .command('tpsl <coin>')
  .description('Get HIP-4 TP/SL order history')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--user <address>', 'Filter by user wallet address')
  .option('--triggered <bool>', 'Filter by triggered status: true or false')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OrdersTpsl);

const hip4L4 = hip4
  .command('l4')
  .description('HIP-4 L4 order-level commands');

hip4L4
  .command('get <coin>')
  .description('Get HIP-4 L4 orderbook reconstruction')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms or ISO 8601)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4L4Get);

hip4L4
  .command('diffs <coin>')
  .description('Get HIP-4 L4 orderbook diffs')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4L4Diffs);

hip4L4
  .command('history <coin>')
  .description('Get HIP-4 L4 orderbook checkpoints')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4L4History);

// ── oxa hip3 ────────────────────────────────────────────────────────────
// HIP-3 builder-market reads with no shared-verb equivalent. Symbols keep
// their builder prefix and case (e.g. km:US500).

const hip3 = program
  .command('hip3')
  .description('HIP-3 builder markets. Symbols keep their builder prefix and case, e.g. km:US500.');

const hip3Oracle = hip3
  .command('oracle')
  .description('HIP-3 oracle reads: the deployer-pushed external price and the discovery bounds');

hip3Oracle
  .command('external-price <symbol>')
  .description('Get the latest deployer-pushed external price and the mark price (either can be null)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip3OracleExternalPrice);

hip3Oracle
  .command('discovery-bounds <symbol>')
  .description('Get the instantaneous discovery bounds around the reference price')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip3OracleDiscoveryBounds);

// ── oxa stream <channel> <symbol> ───────────────────────────────────────
// Realtime WebSocket streaming. Emits one JSON record per stdout line
// (NDJSON) until the user hits Ctrl-C or --duration-ms expires.

const stream = program
  .command('stream')
  .description('Stream live market data, or replay stored data, over WebSocket');

stream
  .command('liquidations <symbol>')
  .description(
    'Stream realtime liquidation events. Defaults to Hyperliquid; pass `--exchange hip3` for HIP-3.',
  )
  .option('--exchange <exchange>', 'hyperliquid (default) or hip3')
  .option('--duration-ms <ms>', 'Auto-close after N milliseconds')
  .option('--url <url>', 'Override WebSocket URL (or set OXA_WS_URL env var)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json (NDJSON) or pretty', 'json')
  .action(streamLiquidationsCommand);

stream
  .command('trades <symbol>')
  .description(
    'Stream realtime trades for a symbol. Lighter trades arrive as two fills per trade (one per side, same tid).',
  )
  .option('--exchange <exchange>', 'hyperliquid (default), hip3, hip4, spot, lighter, or rh-lighter')
  .option('--duration-ms <ms>', 'Auto-close after N milliseconds')
  .option('--url <url>', 'Override WebSocket URL (or set OXA_WS_URL env var)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json (NDJSON) or pretty', 'json')
  .action(streamTradesCommand);

stream
  .command('orderbook <symbol>')
  .description(
    'Stream realtime L2 orderbook updates for a symbol. Lighter (both deployments) sends a full top-20 book, at most one per second by default. ' +
      'HIP-4 books replay only: use `oxa stream replay hip4_orderbook <coin>`, or `oxa orderbook get --exchange hip4` for the current book.',
  )
  .option('--exchange <exchange>', 'hyperliquid (default), hip3, spot, lighter, or rh-lighter')
  .option(
    '--interval-ms <ms>',
    'Lighter and rh-lighter only: milliseconds between books, 100 to 5000 (default 1000). Each book is the newest full state.',
  )
  .option('--duration-ms <ms>', 'Auto-close after N milliseconds')
  .option('--url <url>', 'Override WebSocket URL (or set OXA_WS_URL env var)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json (NDJSON) or pretty', 'json')
  .action(streamOrderbookCommand);

// Generic channel subscription by name. Which channels stream live, and the
// endpoint a channel served on one endpoint only connects to, is the SDK's
// channel table (WS_CHANNEL_CAPABILITIES, which mirrors /v1/capabilities);
// replay-only channels are refused before a socket opens. The symbol is
// optional on `mempool` only.
stream
  .command('subscribe <channel> [symbol]')
  .description(
    'Subscribe to a live WebSocket channel by name: every channel `oxa capabilities` lists as live, ' +
      'e.g. l4_diffs, orderbook_full, hip3_l4_orders, hip4_trades, spot_l4_diffs, lighter_funding, rh_lighter_trades, mempool. ' +
      'Symbols are dashed canonical for spot (HYPE-USDC); HIP-4 coins are bare numerics. ' +
      'Every channel needs a symbol except mempool (pending Hyperliquid transactions; Pro, Scale and Enterprise plans), ' +
      'where it is optional: without one, every pending transaction streams. ' +
      'mempool is served on wss://stream.0xarchive.io/ws only, and the CLI connects there unless --url or OXA_WS_URL is set. ' +
      'Full-depth books (orderbook_full, hip3_orderbook_full) send an l4_snapshot with every level, then l4_batch changes. ' +
      'Replay-only channels (candles, hip3_candles, hip4_orderbook, hip4_open_interest, lighter_candles, ' +
      'lighter_l3_orderbook, rh_lighter_candles) and spot_twap, which is served over REST only, are refused.',
  )
  .option(
    '--interval-ms <ms>',
    'lighter_orderbook and rh_lighter_orderbook only: milliseconds between books, 100 to 5000 (default 1000)',
  )
  .option('--duration-ms <ms>', 'Auto-close after N milliseconds')
  .option('--url <url>', 'Override WebSocket URL (or set OXA_WS_URL env var)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json (NDJSON) or pretty', 'json')
  .action(streamGenericCommand);

stream
  .command('replay <channel> <symbol>')
  .description(
    'Replay stored data over WebSocket, as NDJSON, until the replay completes: every channel `oxa capabilities` lists with replay. ' +
      'Timed channels keep their original timing (scaled by --speed). L4 channels on every venue and the full-depth books ' +
      '(orderbook_full, hip3_orderbook_full) replay in bulk: an l4_snapshot, then l4_batch pages, with --speed ignored. ' +
      'Live-only channels (ticker, all_tickers, spot_orderbook, spot_trades, mempool) and spot_twap, which is served over REST only, ' +
      'are refused before connecting.',
  )
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--speed <n>', 'Playback speed multiplier for timed channels (default 1, real time); the plan sets the maximum')
  .option('--interval <interval>', 'Candle channels only: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w')
  .option('--url <url>', 'Override WebSocket URL (or set OXA_WS_URL env var)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json (NDJSON) or pretty', 'json')
  .action(streamReplayCommand);

// ── oxa spot ────────────────────────────────────────────────────────────
// Hyperliquid Spot. Symbols are dashed canonical (HYPE-USDC, PURR-USDC).
// No funding, OI, or liquidations. Spot candles are served from
// 2025-03-22 10:50 UTC; order book, L4, and TWAP from 2026-05-05. TWAP is
// REST only.

const spot = program
  .command('spot')
  .description(
    'Hyperliquid Spot market data. Symbols are dashed canonical (HYPE-USDC, PURR-USDC). ' +
      'No funding, OI, or liquidations. Candles are available from 2025-03-22. ' +
      'Shared datatypes also take --exchange spot: orderbook, trades, candles, l4, orders history, freshness, and instruments.',
  );

spot
  .command('candles <symbol>')
  .description('Fetch Spot OHLCV candles (from 2025-03-22; max 1000 records)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Candle interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w', '1h')
  .option('--limit <n>', 'Maximum records to return (max 1000)')
  .option('--cursor <cursor>', 'Opaque pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotCandles);

const spotPairs = spot
  .command('pairs')
  .description('Spot pairs, the Spot instruments ("oxa spot pairs" lists them)');

spotPairs
  .command('list', { isDefault: true })
  .description('List every active spot pair')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotPairsList);

spotPairs
  .command('get <symbol>')
  .description('Get a specific spot pair (e.g. "oxa spot pairs get HYPE-USDC")')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotPairGet);

spot
  .command('pair <symbol>')
  .description('Get a specific spot pair (e.g. "oxa spot pair HYPE-USDC")')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotPairGet);

spot
  .command('orderbook <symbol>')
  .description('Get current spot L2 orderbook (live from 2026-05-05)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotOrderbookGet);

spot
  .command('trades <symbol>')
  .description('Fetch spot trade history (from 2025-03-22). Requires --start and --end.')
  .option('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .option('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--side <side>', SIDE_DESC)
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotTrades);

spot
  .command('l4 <symbol>')
  .description('Get spot L4 orderbook reconstruction (live from 2026-05-05)')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms or ISO 8601)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotL4Get);

spot
  .command('l4-diffs <symbol>')
  .description('Get spot L4 orderbook diffs over a time range (live from 2026-05-05)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotL4Diffs);

spot
  .command('l4-history <symbol>')
  .description('Get spot L4 orderbook checkpoints over a time range (live from 2026-05-05)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotL4History);

spot
  .command('orders <symbol>')
  .description('Get spot order lifecycle history (live from 2026-05-05; time range and cursor only)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotOrdersHistory);

spot
  .command('twap')
  .description('Spot TWAP statuses ("oxa spot twap <symbol>" runs "oxa spot twap history <symbol>")')
  .command('history <symbol>', { isDefault: true })
  .description('Get spot TWAP statuses for a pair (from 2026-05-05; REST only, not streamed)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotTwapBySymbol);

spot
  .command('twap-user <user>')
  .description('Get spot TWAP statuses for a user wallet across all pairs')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotTwapByUser);

spot
  .command('freshness <symbol>')
  .description('Check spot data freshness across orderbook, trades, L4, TWAP')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotFreshness);

// ── oxa positions ... ───────────────────────────────────────────────────
// Account positions on Hyperliquid, HIP-3, and both Lighter deployments.
// Hyperliquid and HIP-3 are keyed by wallet address (--address), Lighter by
// integer account index (--account).

const positions = program
  .command('positions')
  .description(
    'Account positions: current or as of a time, hourly history, change log, per-market listings and summaries ' +
      '(hyperliquid, hip3, lighter, rh-lighter)',
  );

positions
  .command('get')
  .description('Get the open positions of a wallet (Hyperliquid, HIP-3) or account (Lighter), now or as of --timestamp')
  .requiredOption('--exchange <exchange>', POSITIONS_EXCHANGE_DESC)
  .option('--address <address>', 'Wallet address, 0x... (hyperliquid, hip3)')
  .option('--account <index>', 'Lighter account index (lighter, rh-lighter)')
  .option('--timestamp <time>', 'As-of time (ISO 8601 or Unix ms): state after every event before it. Omit for the latest snapshot.')
  .option('--symbol <symbol>', 'Only this market')
  .option('--dex <dex>', 'HIP-3 only: restrict to one dex')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(positionsGetCommand);

positions
  .command('history')
  .description('Get hourly position snapshots for a wallet or account over a time range')
  .requiredOption('--exchange <exchange>', POSITIONS_EXCHANGE_DESC)
  .option('--address <address>', 'Wallet address, 0x... (hyperliquid, hip3)')
  .option('--account <index>', 'Lighter account index (lighter, rh-lighter)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms), inclusive')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms), exclusive')
  .option('--symbol <symbol>', 'Only this market')
  .option('--dex <dex>', 'HIP-3 only: restrict to one dex')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(positionsHistoryCommand);

positions
  .command('changes')
  .description('Get the position change log (every fill leg on the position, including legs that leave the size unchanged) for a wallet or account')
  .requiredOption('--exchange <exchange>', POSITIONS_EXCHANGE_DESC)
  .option('--address <address>', 'Wallet address, 0x... (hyperliquid, hip3)')
  .option('--account <index>', 'Lighter account index (lighter, rh-lighter)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms), inclusive')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms), exclusive')
  .option('--symbol <symbol>', 'Only this market')
  .option('--dex <dex>', 'HIP-3 only: restrict to one dex')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(positionsChangesCommand);

positions
  .command('market')
  .description('List every open position in one market, largest position value first, now or at --hour')
  .requiredOption('--exchange <exchange>', POSITIONS_EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Market symbol (e.g. BTC, xyz:TSLA)')
  .option('--hour <time>', 'An exact UTC hour (ISO 8601 or Unix ms) for a committed hourly snapshot. Omit for the latest.')
  .option('--side <side>', 'long or short')
  .option('--min-value <usd>', 'Minimum position value in USD')
  .option('--include-system', 'Lighter only: include settlement, insurance, and other system accounts')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(positionsMarketCommand);

positions
  .command('summary')
  .description('Long/short counts, sizes, values, average entries, and top-10 share for one market, now or hourly over a range')
  .requiredOption('--exchange <exchange>', POSITIONS_EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Market symbol (e.g. BTC, xyz:TSLA)')
  .option('--start <time>', 'Start of an hourly series (ISO 8601 or Unix ms); pass with --end')
  .option('--end <time>', 'End of an hourly series (ISO 8601 or Unix ms); pass with --start')
  .option('--include-system', 'Lighter only: include settlement, insurance, and other system accounts')
  .option('--limit <n>', 'Maximum hourly points to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response (hourly series; repeat the same --start and --end)')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(positionsSummaryCommand);

positions
  .command('all')
  .description('Every open position across all markets at one hourly snapshot (bulk, paginated)')
  .requiredOption('--exchange <exchange>', POSITIONS_EXCHANGE_DESC)
  .requiredOption('--hour <time>', 'An exact UTC hour (ISO 8601 or Unix ms)')
  .option('--include-system', 'Lighter only: include settlement, insurance, and other system accounts')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(positionsAllCommand);

positions
  .command('account')
  .description('Get the account summary of a wallet: account value, margin, position value, PnL (hyperliquid, hip3)')
  .requiredOption('--exchange <exchange>', 'Exchange: hyperliquid or hip3')
  .requiredOption('--address <address>', 'Wallet address, 0x...')
  .option('--dex <dex>', 'HIP-3 only: restrict to one dex')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(accountGetCommand);

positions
  .command('account-history')
  .description('Get hourly account summaries of a wallet over a time range (hyperliquid, hip3)')
  .requiredOption('--exchange <exchange>', 'Exchange: hyperliquid or hip3')
  .requiredOption('--address <address>', 'Wallet address, 0x...')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms), inclusive')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms), exclusive')
  .option('--dex <dex>', 'HIP-3 only: restrict to one dex')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(accountHistoryCommand);

// ── oxa lighter accounts by-l1 (also: oxa accounts by-l1) ──────────────

const ACCOUNTS_DESC = 'Lighter account lookup';

function addAccountsByL1(group: Command): void {
  group
    .command('by-l1')
    .description('List the Lighter account indices owned by an L1 (Ethereum) address (Lighter mainnet)')
    .requiredOption('--l1-address <address>', 'L1 address, 0x...')
    .option('--exchange <exchange>', 'lighter (Lighter mainnet; the only deployment with this lookup)', 'lighter')
    .option('--limit <n>', 'Maximum records to return')
    .option('--cursor <cursor>', 'Pagination cursor from previous response')
    .option('--out <path>', 'Write JSON output to file')
    .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
    .option('--format <format>', 'Output format: json or pretty', 'json')
    .action(accountsByL1Command);
}

addAccountsByL1(program.command('accounts').description(ACCOUNTS_DESC));

// ── oxa lighter ... ─────────────────────────────────────────────────────
// Lighter-only datatypes, under the venue: the L3 order book and the account
// lookup, both on Lighter mainnet. Shared datatypes take --exchange lighter.

const lighter = program
  .command('lighter')
  .description(
    'Lighter-only datatypes: the L3 order book and the L1 account lookup (Lighter mainnet). Shared datatypes take --exchange lighter.',
  );

addL3Commands(lighter.command('l3').description(L3_DESC));
addAccountsByL1(lighter.command('accounts').description(ACCOUNTS_DESC));

// ── oxa wallets classify ────────────────────────────────────────────────

const wallets = program
  .command('wallets')
  .description('Wallet classification: precomputed daily behavioral metrics (Hyperliquid and HIP-3)');

wallets
  .command('classify')
  .description('Classify active wallets for one daily snapshot (yesterday by default), with filters, sorting, and offset paging')
  .requiredOption('--exchange <exchange>', HL_EXCHANGE_DESC)
  .option('--min-orders <n>', 'Minimum order count (default 100)')
  .option('--min-volume-usd <usd>', 'Minimum fill volume in USD (default 0)')
  .option('--sort <metric>', `Sort metric (default total_orders): ${WALLET_SORTS.join(', ')}`)
  .option('--order <order>', 'Sort order: asc or desc (default desc)')
  .option('--uses-twap <bool>', 'Only wallets that do (true) or do not (false) use TWAP orders')
  .option('--uses-priority-gas <bool>', 'Only wallets that do (true) or do not (false) pay priority gas')
  .option('--min-cancel-rate <rate>', 'Minimum cancel rate, 0 to 1')
  .option('--max-cancel-rate <rate>', 'Maximum cancel rate, 0 to 1')
  .option('--date <yyyy-mm-dd>', 'Snapshot date in UTC (defaults to yesterday)')
  .option('--limit <n>', 'Wallets per page, 1 to 1000 (default 100)')
  .option('--offset <n>', 'Page offset, 0 to 100000 (default 0)')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(walletsClassifyCommand);

// ── oxa webhooks ... ────────────────────────────────────────────────────
// Endpoints, subscriptions, watched wallets, previews, and delivery
// verification. Deleting and rotating ask for confirmation (or --yes).

const webhooks = program
  .command('webhooks')
  .description('Webhooks: endpoints, subscriptions, watched wallets, previews, deliveries, and signature verification');

const API_KEY_DESC = 'API key (or set OXA_API_KEY env var)';
const FORMAT_DESC = 'Output format: json or pretty';
const YES_DESC = 'Skip the confirmation prompt';

webhooks
  .command('event-types')
  .description('List every event type with the filters, parameters, metrics, and operators it accepts')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksEventTypesCommand);

webhooks
  .command('limits')
  .description('Show what your plan allows for webhooks, what is in use, and today\'s delivery budget')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksLimitsCommand);

const endpoints = webhooks.command('endpoints').description('Delivery endpoints: your URL plus its signing secret');

endpoints
  .command('list')
  .description('List your endpoints, oldest first (secrets are never listed)')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksEndpointsListCommand);

endpoints
  .command('create')
  .description('Create an endpoint. Its signing secret is shown once, in this response.')
  .requiredOption('--url <url>', 'HTTPS URL that receives deliveries')
  .option('--description <text>', 'Your own label for the endpoint')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksEndpointsCreateCommand);

endpoints
  .command('delete <endpoint_id>')
  .description('Delete an endpoint and every subscription that points at it')
  .option('--yes', YES_DESC)
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksEndpointsDeleteCommand);

endpoints
  .command('enable <endpoint_id>')
  .description('Put a disabled endpoint back into service (missed events are not replayed)')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksEndpointsEnableCommand);

endpoints
  .command('rotate-secret <endpoint_id>')
  .description('Rotate the signing secret. The new one is shown once; the previous one keeps verifying for 24 hours.')
  .option('--yes', YES_DESC)
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksEndpointsRotateSecretCommand);

endpoints
  .command('test <endpoint_id>')
  .description('Queue a signed webhook.test delivery (counts against today\'s delivery budget)')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksEndpointsTestCommand);

endpoints
  .command('deliveries <endpoint_id>')
  .description('List an endpoint\'s delivery log, newest first, with each payload as signed')
  .option('--limit <n>', 'Deliveries to return, 1 to 200 (default 50)')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksEndpointsDeliveriesCommand);

webhooks
  .command('redeliver <delivery_id>')
  .description('Queue a past delivery again with the same event id (counts against today\'s delivery budget)')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksRedeliverCommand);

const subscriptions = webhooks
  .command('subscriptions')
  .description('Subscriptions: one event type and configuration, delivered to one endpoint');

subscriptions
  .command('list')
  .description('List your subscriptions with their configuration and pause state')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksSubscriptionsListCommand);

subscriptions
  .command('create')
  .description('Create a subscription. Filters are validated against the event type\'s catalog entry.')
  .requiredOption('--endpoint <endpoint_id>', 'Endpoint that receives the deliveries')
  .requiredOption('--event-type <type>', 'Event type, e.g. market.liquidation (see `oxa webhooks event-types`)')
  .option('--filters <json>', 'Configuration as a JSON object, e.g. \'{"venue":"hyperliquid","min_notional_usd":250000}\'')
  .option('--filters-file <path>', 'Read the configuration JSON from a file')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksSubscriptionsCreateCommand);

subscriptions
  .command('update <subscription_id>')
  .description('Replace a subscription\'s configuration, switch it on or off, or both')
  .option('--filters <json>', 'Replacement configuration as a JSON object (replaces the stored one)')
  .option('--filters-file <path>', 'Read the replacement configuration JSON from a file')
  .option('--enabled <bool>', 'true or false')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksSubscriptionsUpdateCommand);

subscriptions
  .command('delete <subscription_id>')
  .description('Delete a subscription (its endpoint and other subscriptions are untouched)')
  .option('--yes', YES_DESC)
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksSubscriptionsDeleteCommand);

subscriptions
  .command('resume <subscription_id>')
  .description('Put one paused subscription back into service; the result carries the missed window')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksSubscriptionsResumeCommand);

subscriptions
  .command('resume-all')
  .description('Put every paused subscription back into service in one call')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksSubscriptionsResumeAllCommand);

webhooks
  .command('estimate')
  .description('Estimate how often a rule would have fired over 1 to 30 days, without creating it (every plan)')
  .requiredOption('--event-type <type>', 'Event type to evaluate')
  .option('--config <json>', 'Configuration as a JSON object, as for a subscription\'s filters')
  .option('--config-file <path>', 'Read the configuration JSON from a file')
  .option('--lookback-days <n>', 'Days of history, 1 to 30 (default 7)')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksEstimateCommand);

webhooks
  .command('dry-run')
  .description('List the occurrences a rule would have delivered over a recent window, without creating it (every plan)')
  .requiredOption('--event-type <type>', 'Event type to evaluate')
  .option('--config <json>', 'Configuration as a JSON object, as for a subscription\'s filters')
  .option('--config-file <path>', 'Read the configuration JSON from a file')
  .option('--lookback-s <seconds>', 'Seconds of history, 60 to 86400 (default 3600)')
  .option('--limit <n>', 'Occurrences to return, newest first, 1 to 200 (default 100)')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksDryRunCommand);

const addresses = webhooks
  .command('addresses')
  .description('Watched wallets: the addresses in scope for address-scoped events such as account.fill');

addresses
  .command('list')
  .description('List your watched wallets and how many your plan allows')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksAddressesListCommand);

addresses
  .command('add')
  .description('Watch a wallet (adding one you already watch returns the existing entry)')
  .requiredOption('--address <address>', 'Wallet address, 0x followed by 40 hex characters')
  .option('--label <text>', 'Your own label, at most 64 characters')
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksAddressesAddCommand);

addresses
  .command('delete <address_id>')
  .description('Stop watching a wallet (subscriptions that name it keep their stored filters)')
  .option('--yes', YES_DESC)
  .option('--api-key <key>', API_KEY_DESC)
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksAddressesDeleteCommand);

webhooks
  .command('verify')
  .description(
    'Verify a delivery\'s 0xa-signature against its raw body (from --body-file or stdin). No API key needed; the secret is never printed.',
  )
  .requiredOption('--signature <value>', 'The 0xa-signature header value, e.g. t=1758240000,v1=...')
  .option(
    '--secret <secret>',
    'Endpoint signing secret; repeat during a rotation to accept either (or set OXA_WEBHOOK_SECRET)',
    collect,
    [] as string[],
  )
  .option('--body-file <path>', 'File holding the raw request body, byte for byte (default: read stdin)')
  .option('--tolerance <seconds>', 'Replay window in seconds around the signing time (default 300)')
  .option('--ignore-timestamp', 'Skip the replay window, for a stored delivery or a test vector')
  .option('--format <format>', FORMAT_DESC, 'json')
  .action(webhooksVerifyCommand);
