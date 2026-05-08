import { Command } from 'commander';
import { authTestCommand } from './commands/auth.js';
import { orderbookGetCommand, orderbookHistoryCommand } from './commands/orderbook.js';
import { tradesFetchCommand } from './commands/trades.js';
import { freshnessCommand } from './commands/freshness.js';
import { candlesCommand } from './commands/candles.js';
import { fundingCurrentCommand, fundingHistoryCommand } from './commands/funding.js';
import { oiCurrentCommand, oiHistoryCommand } from './commands/openinterest.js';
import { instrumentsCommand } from './commands/instruments.js';
import { liquidationsCommand, liquidationsVolumeCommand, liquidationsUserCommand } from './commands/liquidations.js';
import { summaryCommand } from './commands/summary.js';
import { pricesCommand } from './commands/prices.js';
import { ordersHistoryCommand, ordersFlowCommand, ordersTpslCommand } from './commands/orders.js';
import { l4GetCommand, l4DiffsCommand, l4HistoryCommand } from './commands/l4.js';
import { l2GetCommand, l2HistoryCommand, l2DiffsCommand } from './commands/l2.js';
import { l3GetCommand, l3HistoryCommand } from './commands/l3.js';
import { outcomesListCommand, outcomesGetCommand } from './commands/outcomes.js';
import {
  hip4OrderbookGet,
  hip4OrderbookHistory,
  hip4Trades,
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
} from './commands/hip4.js';
import {
  streamLiquidationsCommand,
  streamTradesCommand,
  streamOrderbookCommand,
  streamGenericCommand,
} from './commands/stream.js';
import {
  spotPairsList,
  spotPairGet,
  spotOrderbookGet,
  spotTrades,
  spotL4Get,
  spotOrdersHistory,
  spotTwapBySymbol,
  spotTwapByUser,
  spotFreshness,
} from './commands/spot.js';
import { exitError, EXIT } from './lib/output.js';

const VERSION = '1.7.0';

const EXCHANGE_DESC =
  'Exchange: hyperliquid, lighter, hip3, or hip4. ' +
  'For hip4, coins are bare numerics (e.g. "0", "1", "42"); legacy "#0" / "%230" forms are also accepted. mark_price is an implied probability (0..1), not a USD price.';

const program = new Command()
  .name('oxa')
  .description('0xArchive CLI — Query historical crypto market data')
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

// ── oxa orderbook get ───────────────────────────────────────────────────

const orderbook = program
  .command('orderbook')
  .description('Orderbook commands');

orderbook
  .command('get')
  .description('Get an orderbook snapshot')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(orderbookGetCommand);

orderbook
  .command('history')
  .description('Get historical orderbook snapshots over a time range')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(orderbookHistoryCommand);

// ── oxa trades fetch ────────────────────────────────────────────────────

const trades = program
  .command('trades')
  .description('Trade history commands');

trades
  .command('fetch')
  .description('Fetch trade history')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .option('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(tradesFetchCommand);

// ── oxa candles ─────────────────────────────────────────────────────────

program
  .command('candles')
  .description('Get OHLCV candle data')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
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

// ── oxa funding current / history ───────────────────────────────────────

const funding = program
  .command('funding')
  .description('Funding rate data');

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
  .option('--interval <interval>', 'Aggregation interval: 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(fundingHistoryCommand);

// ── oxa oi current / history ────────────────────────────────────────────

const oi = program
  .command('oi')
  .description('Open interest data');

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
  .option('--interval <interval>', 'Aggregation interval: 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(oiHistoryCommand);

// ── oxa instruments ─────────────────────────────────────────────────────

program
  .command('instruments')
  .description('List available instruments/coins')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(instrumentsCommand);

// ── oxa liquidations history / volume / user ────────────────────────────

const liquidations = program
  .command('liquidations')
  .description('Liquidation data (Hyperliquid and HIP-3)');

liquidations
  .command('history')
  .description('Get liquidation history')
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
  .description('Get pre-aggregated liquidation volume in time buckets')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 5m, 15m, 30m, 1h, 4h, 1d', '1h')
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

// ── oxa summary ─────────────────────────────────────────────────────────

program
  .command('summary')
  .description('Get market summary (price, funding, OI, volume) in one call')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(summaryCommand);

// ── oxa prices ──────────────────────────────────────────────────────────

program
  .command('prices')
  .description('Get mark/oracle/mid price history')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(pricesCommand);

// ── oxa freshness ───────────────────────────────────────────────────────

program
  .command('freshness')
  .description('Check data freshness for a symbol')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH, km:US500)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(freshnessCommand);

// ── oxa orders history / flow / tpsl ────────────────────────────────────

const orders = program
  .command('orders')
  .description('Order history and flow commands (Build+ / Pro+ tier)');

orders
  .command('history')
  .description('Get order history with user attribution (Build+ tier)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--user <address>', 'Filter by user wallet address')
  .option('--status <status>', 'Filter by status: open, filled, cancelled, expired')
  .option('--order-type <type>', 'Filter by type: limit, market, trigger, tpsl')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(ordersHistoryCommand);

orders
  .command('flow')
  .description('Get order flow aggregation (Build+ tier)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d', '1h')
  .option('--limit <n>', 'Maximum records to return')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(ordersFlowCommand);

orders
  .command('tpsl')
  .description('Get TP/SL order history (Pro+ tier)')
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

// ── oxa l4 get / diffs / history ────────────────────────────────────────

const l4 = program
  .command('l4')
  .description('L4 order-level orderbook commands (Build+ / Pro+ tier)');

l4
  .command('get')
  .description('Get L4 orderbook reconstruction at a timestamp (Pro+ tier)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms or ISO 8601)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l4GetCommand);

l4
  .command('diffs')
  .description('Get L4 orderbook diffs (Pro+ tier)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
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
  .description('Get L4 orderbook checkpoints (Pro+ tier)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
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
  .description('L2 full-depth orderbook commands derived from L4 data (Build+ / Pro+ tier)');

l2
  .command('get')
  .description('Get L2 full-depth orderbook at a timestamp (Build+ tier)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms or ISO 8601)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l2GetCommand);

l2
  .command('history')
  .description('Get L2 full-depth orderbook checkpoints (Build+ tier)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH, km:US500)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l2HistoryCommand);

l2
  .command('diffs')
  .description('Get L2 tick-level orderbook diffs (Pro+ tier)')
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

// ── oxa l3 get / history (Lighter only) ─────────────────────────────────

const l3 = program
  .command('l3')
  .description('L3 order-level orderbook commands — Lighter only (Pro+ tier)');

l3
  .command('get')
  .description('Get Lighter L3 orderbook snapshot (Pro+ tier)')
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l3GetCommand);

l3
  .command('history')
  .description('Get historical Lighter L3 orderbook snapshots (Pro+ tier)')
  .requiredOption('--symbol <symbol>', 'Trading symbol (e.g. BTC, ETH)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(l3HistoryCommand);

// ── oxa outcomes (HIP-4 only) ───────────────────────────────────────────

const outcomes = program
  .command('outcomes')
  .description('HIP-4 outcome markets (binary outcome metadata) — Build+ tier');

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

// ── oxa hip4 ────────────────────────────────────────────────────────────
// Explicit HIP-4 command surface. Coins are bare numerics (e.g. `0`, `1`).
// HIP-4 has no funding/liquidations/candles by design, so those verbs are
// intentionally absent.

const hip4 = program
  .command('hip4')
  .description('HIP-4 outcome markets (binary prediction markets). Coins are bare numerics, e.g. "0", "1".');

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
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4Trades);

const hip4Oi = hip4
  .command('oi')
  .description('HIP-4 open interest commands (per-side; mark_price is implied probability 0..1)');

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
  .option('--interval <interval>', 'Aggregation interval: 5m, 15m, 30m, 1h, 4h, 1d')
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
  .option('--interval <interval>', 'Aggregation interval: 5m, 15m, 30m, 1h, 4h, 1d')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4Prices);

const hip4Orders = hip4
  .command('orders')
  .description('HIP-4 order history / flow / TP-SL (Build+ / Pro+ tier)');

hip4Orders
  .command('history <coin>')
  .description('Get HIP-4 order history with user attribution (Build+ tier)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--user <address>', 'Filter by user wallet address')
  .option('--status <status>', 'Filter by status: open, filled, cancelled, expired')
  .option('--order-type <type>', 'Filter by type: limit, market, trigger, tpsl')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OrdersHistory);

hip4Orders
  .command('flow <coin>')
  .description('Get HIP-4 order flow aggregation (Build+ tier)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--interval <interval>', 'Aggregation interval: 1m, 5m, 15m, 30m, 1h, 4h, 1d', '1h')
  .option('--limit <n>', 'Maximum records to return')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4OrdersFlow);

hip4Orders
  .command('tpsl <coin>')
  .description('Get HIP-4 TP/SL order history (Pro+ tier)')
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
  .description('HIP-4 L4 order-level commands (Pro+ tier)');

hip4L4
  .command('get <coin>')
  .description('Get HIP-4 L4 orderbook reconstruction (Pro+ tier)')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms or ISO 8601)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4L4Get);

hip4L4
  .command('diffs <coin>')
  .description('Get HIP-4 L4 orderbook diffs (Pro+ tier)')
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
  .description('Get HIP-4 L4 orderbook checkpoints (Build+ tier)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(hip4L4History);

// ── oxa stream <channel> <symbol> ───────────────────────────────────────
// Realtime WebSocket streaming. Emits one JSON record per stdout line
// (NDJSON) until the user hits Ctrl-C or --duration-ms expires.

const stream = program
  .command('stream')
  .description('Stream realtime market data over WebSocket (Build+ tier; requires Node 22+)');

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
  .description('Stream realtime trades for a symbol')
  .option('--exchange <exchange>', 'hyperliquid (default), hip3, or lighter')
  .option('--duration-ms <ms>', 'Auto-close after N milliseconds')
  .option('--url <url>', 'Override WebSocket URL (or set OXA_WS_URL env var)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json (NDJSON) or pretty', 'json')
  .action(streamTradesCommand);

stream
  .command('orderbook <symbol>')
  .description('Stream realtime L2 orderbook updates for a symbol')
  .option('--exchange <exchange>', 'hyperliquid (default), hip3, or lighter')
  .option('--duration-ms <ms>', 'Auto-close after N milliseconds')
  .option('--url <url>', 'Override WebSocket URL (or set OXA_WS_URL env var)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json (NDJSON) or pretty', 'json')
  .action(streamOrderbookCommand);

// Generic channel subscription. Use this for spot (spot_orderbook,
// spot_trades, spot_l4_diffs, spot_l4_orders, spot_twap) and any other
// raw WebSocket channel name not covered by the dedicated verbs above.
stream
  .command('subscribe <channel> <symbol>')
  .description(
    'Subscribe to a raw WebSocket channel by name. ' +
      'For spot: spot_orderbook, spot_trades, spot_l4_diffs, spot_l4_orders, spot_twap. ' +
      'Symbols are dashed canonical for spot (HYPE-USDC, PURR-USDC).',
  )
  .option('--duration-ms <ms>', 'Auto-close after N milliseconds')
  .option('--url <url>', 'Override WebSocket URL (or set OXA_WS_URL env var)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json (NDJSON) or pretty', 'json')
  .action(streamGenericCommand);

// ── oxa spot ────────────────────────────────────────────────────────────
// Hyperliquid Spot. Symbols are dashed canonical (HYPE-USDC, PURR-USDC).
// No funding, OI, liquidations, or candles by design (perp-only constructs).
// Coverage: trades from 2025-03-22; orderbook, L4, TWAP live from 2026-05-05.

const spot = program
  .command('spot')
  .description(
    'Hyperliquid Spot market data. Symbols are dashed canonical (HYPE-USDC, PURR-USDC). ' +
      'No funding, OI, liquidations, or candles by design.',
  );

spot
  .command('pairs')
  .description('List every active spot pair (294 pairs)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotPairsList);

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
  .description('Fetch spot trade history (S3 backfill from 2025-03-22). Requires --start and --end.')
  .option('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .option('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--user <address>', 'Filter by user wallet address')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotTrades);

spot
  .command('l4 <symbol>')
  .description('Get spot L4 orderbook reconstruction (Pro+ tier; live from 2026-05-05)')
  .option('--timestamp <ms>', 'Historical timestamp (Unix ms or ISO 8601)')
  .option('--depth <n>', 'Number of price levels per side')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotL4Get);

spot
  .command('orders <symbol>')
  .description('Get spot order lifecycle history (Pro+ tier; live from 2026-05-05)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--user <address>', 'Filter by user wallet address')
  .option('--status <status>', 'Filter by status: open, filled, cancelled, expired')
  .option('--order-type <type>', 'Filter by type: limit, market, trigger, tpsl')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(spotOrdersHistory);

spot
  .command('twap <symbol>')
  .description('Get spot TWAP statuses for a pair (Build+; live from 2026-05-05)')
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
  .description('Get spot TWAP statuses for a user wallet across all pairs (Build+)')
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

program.parse();
