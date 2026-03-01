import { Command } from 'commander';
import { authTestCommand } from './commands/auth.js';
import { orderbookGetCommand } from './commands/orderbook.js';
import { tradesFetchCommand } from './commands/trades.js';
import { freshnessCommand } from './commands/freshness.js';

const VERSION = '1.0.0';

const program = new Command()
  .name('oxa')
  .description('0xArchive CLI — Query historical crypto market data')
  .version(VERSION);

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
  .requiredOption('--exchange <exchange>', 'Exchange: hyperliquid or lighter')
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH)')
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
  .requiredOption('--exchange <exchange>', 'Exchange: hyperliquid or lighter')
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH)')
  .option('--start <iso>', 'Start time (ISO 8601 or Unix ms)')
  .option('--end <iso>', 'End time (ISO 8601 or Unix ms)')
  .option('--limit <n>', 'Maximum records to return')
  .option('--cursor <cursor>', 'Pagination cursor from previous response')
  .option('--out <path>', 'Write JSON output to file')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(tradesFetchCommand);

// ── oxa freshness ───────────────────────────────────────────────────────

program
  .command('freshness')
  .description('Check data freshness for a symbol')
  .requiredOption('--exchange <exchange>', 'Exchange: hyperliquid or lighter')
  .requiredOption('--symbol <symbol>', 'Coin symbol (e.g. BTC, ETH)')
  .option('--api-key <key>', 'API key (or set OXA_API_KEY env var)')
  .option('--format <format>', 'Output format: json or pretty', 'json')
  .action(freshnessCommand);

program.parse();
