import { Command } from 'commander';
import { authTestCommand } from './commands/auth.js';
import { orderbookGetCommand } from './commands/orderbook.js';
import { tradesFetchCommand } from './commands/trades.js';
import { freshnessCommand } from './commands/freshness.js';
import { candlesCommand } from './commands/candles.js';
import { fundingCurrentCommand, fundingHistoryCommand } from './commands/funding.js';
import { oiCurrentCommand, oiHistoryCommand } from './commands/openinterest.js';
import { instrumentsCommand } from './commands/instruments.js';
import { liquidationsCommand } from './commands/liquidations.js';
import { summaryCommand } from './commands/summary.js';
import { pricesCommand } from './commands/prices.js';
import { exitError, EXIT } from './lib/output.js';

const VERSION = '1.1.0';

const EXCHANGE_DESC = 'Exchange: hyperliquid, lighter, or hip3';

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

// ── oxa liquidations ────────────────────────────────────────────────────

program
  .command('liquidations')
  .description('Get liquidation history (Hyperliquid only)')
  .requiredOption('--exchange <exchange>', EXCHANGE_DESC)
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH)')
  .requiredOption('--start <time>', 'Start time (ISO 8601 or Unix ms)')
  .requiredOption('--end <time>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(liquidationsCommand);

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

program.parse();
