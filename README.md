# @0xarchive/cli

Command-line interface for querying historical crypto market data from [0xArchive](https://0xarchive.io). Built for AI agents and automated workflows — access orderbooks, trades, candles, funding rates, open interest, liquidations, and more across Hyperliquid, Lighter.xyz, and HIP-3 directly from your terminal.

## Installation

```bash
npm install -g @0xarchive/cli
```

Or run without installing:

```bash
npx @0xarchive/cli auth test --exchange hyperliquid --symbol BTC
```

## Quick Start

```bash
# Set your API key (get one at https://0xarchive.io)
export OXA_API_KEY="0xa_your_api_key"

# Verify your key works
oxa auth test

# Get BTC orderbook
oxa orderbook get --exchange hyperliquid --symbol BTC --format pretty

# Get 1h candles for the last day
oxa candles --exchange hyperliquid --symbol BTC \
  --start 2026-02-28T00:00:00Z --end 2026-03-01T00:00:00Z --interval 1h

# Get current funding rate
oxa funding current --exchange hyperliquid --symbol BTC

# Get market summary (price, funding, OI, volume in one call)
oxa summary --exchange hyperliquid --symbol BTC

# List all available instruments
oxa instruments --exchange hyperliquid

# Get recent trades from Lighter
oxa trades fetch --exchange lighter --symbol BTC --limit 50

# Check data freshness
oxa freshness --exchange hyperliquid --symbol BTC
```

## Exchanges

Three exchanges are supported across all commands:

| Exchange | Flag | Symbols |
|----------|------|---------|
| Hyperliquid | `--exchange hyperliquid` | `BTC`, `ETH`, `SOL`, etc. |
| Lighter.xyz | `--exchange lighter` | `BTC`, `ETH`, etc. |
| HIP-3 | `--exchange hip3` | `km:US500`, `km:TSLA`, etc. (case-sensitive) |

## Commands

### `oxa auth test`

Verify your API key is valid by making a lightweight API call.

```bash
oxa auth test [--api-key <key>] [--exchange <exchange>] [--symbol <symbol>] [--format <format>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--api-key` | `OXA_API_KEY` env | Your API key |
| `--exchange` | `hyperliquid` | Exchange to check against |
| `--symbol` | `BTC` | Symbol to use for the check |
| `--format` | `json` | Output format: `json` or `pretty` |

### `oxa orderbook get`

Get an orderbook snapshot for a symbol.

```bash
oxa orderbook get --exchange <exchange> --symbol <symbol> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Coin symbol |
| `--depth` | No | Number of price levels per side |
| `--timestamp` | No | Historical timestamp (Unix ms) |
| `--format` | No | `json` (default) or `pretty` |

### `oxa orderbook history`

Get historical orderbook snapshots over a time range.

```bash
oxa orderbook history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--depth` | No | Number of price levels per side |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa trades fetch`

Fetch trade history for a symbol.

```bash
oxa trades fetch --exchange <exchange> --symbol <symbol> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Coin symbol |
| `--start` | Conditional | Start time (ISO 8601 or Unix ms) |
| `--end` | Conditional | End time (ISO 8601 or Unix ms) |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor from previous response |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

**Note:** Hyperliquid trades always require `--start` and `--end`. Lighter and HIP-3 can fetch recent trades without a range.

### `oxa candles`

Get OHLCV candle data.

```bash
oxa candles --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--interval` | No | `1m`, `5m`, `15m`, `30m`, `1h` (default), `4h`, `1d`, `1w` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa funding current`

Get the current funding rate.

```bash
oxa funding current --exchange <exchange> --symbol <symbol> [--format <format>]
```

### `oxa funding history`

Get funding rate history over a time range.

```bash
oxa funding history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--interval` | No | Aggregation: `5m`, `15m`, `30m`, `1h`, `4h`, `1d` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--format` | No | `json` (default) or `pretty` |

### `oxa oi current`

Get current open interest.

```bash
oxa oi current --exchange <exchange> --symbol <symbol> [--format <format>]
```

### `oxa oi history`

Get open interest history over a time range.

```bash
oxa oi history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--interval` | No | Aggregation: `5m`, `15m`, `30m`, `1h`, `4h`, `1d` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--format` | No | `json` (default) or `pretty` |

### `oxa instruments`

List all available instruments/coins on an exchange.

```bash
oxa instruments --exchange <exchange> [--format <format>]
```

### `oxa liquidations history`

Get liquidation history (Hyperliquid and HIP-3, data from May 2025 for Hyperliquid, Feb 2026 for HIP-3).

```bash
oxa liquidations history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid` or `hip3` |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--format` | No | `json` (default) or `pretty` |

### `oxa liquidations volume`

Get pre-aggregated liquidation volume in time-bucketed intervals. Returns total, long, and short USD volumes per bucket.

```bash
oxa liquidations volume --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid` or `hip3` |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--interval` | No | Aggregation: `5m`, `15m`, `30m`, `1h` (default), `4h`, `1d` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa liquidations user`

Get liquidations for a specific user address (Hyperliquid only).

```bash
oxa liquidations user --exchange hyperliquid --user <address> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Must be `hyperliquid` |
| `--user` | Yes | User wallet address (e.g. 0x1234...) |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--coin` | No | Filter by coin symbol |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa summary`

Get a combined market summary in one call: mark price, oracle price, funding rate, open interest, 24h volume, and liquidation volumes.

```bash
oxa summary --exchange <exchange> --symbol <symbol> [--format <format>]
```

### `oxa prices`

Get mark/oracle/mid price history over a time range.

```bash
oxa prices --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--interval` | No | Aggregation: `5m`, `15m`, `30m`, `1h`, `4h`, `1d` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--format` | No | `json` (default) or `pretty` |

### `oxa freshness`

Check data freshness across all data types for a symbol.

```bash
oxa freshness --exchange <exchange> --symbol <symbol> [--format <format>]
```

### `oxa orders history`

Get order history with user attribution. Requires Build+ tier.

```bash
oxa orders history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Trading symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--user` | No | Filter by user wallet address |
| `--status` | No | Filter by status: `open`, `filled`, `cancelled`, `expired` |
| `--order-type` | No | Filter by type: `limit`, `market`, `trigger`, `tpsl` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa orders flow`

Get order flow aggregation. Requires Build+ tier.

```bash
oxa orders flow --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Trading symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--interval` | No | Aggregation interval: `1m`, `5m`, `15m`, `30m`, `1h` (default), `4h`, `1d` |
| `--limit` | No | Maximum records to return |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa orders tpsl`

Get TP/SL (take-profit / stop-loss) order history. Requires Pro+ tier.

```bash
oxa orders tpsl --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Trading symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--user` | No | Filter by user wallet address |
| `--triggered` | No | Filter by triggered status: `true` or `false` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa l4 get`

Get an L4 order-level orderbook reconstruction at a point in time. Requires Pro+ tier.

```bash
oxa l4 get --exchange <exchange> --symbol <symbol> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Trading symbol |
| `--timestamp` | No | Historical timestamp (Unix ms or ISO 8601) |
| `--depth` | No | Number of price levels per side |
| `--format` | No | `json` (default) or `pretty` |

### `oxa l4 diffs`

Get L4 orderbook diffs (individual order-level changes) over a time range. Requires Pro+ tier.

```bash
oxa l4 diffs --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Trading symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa l4 history`

Get L4 orderbook checkpoints (full snapshots at periodic intervals) over a time range. Requires Pro+ tier.

```bash
oxa l4 history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Trading symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa l2 get`

Get an L2 full-depth orderbook snapshot derived from L4 data. Requires Build+ tier.

```bash
oxa l2 get --exchange <exchange> --symbol <symbol> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Trading symbol |
| `--timestamp` | No | Historical timestamp (Unix ms or ISO 8601) |
| `--depth` | No | Number of price levels per side |
| `--format` | No | `json` (default) or `pretty` |

### `oxa l2 history`

Get L2 full-depth orderbook history over a time range. Requires Build+ tier.

```bash
oxa l2 history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Trading symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--depth` | No | Number of price levels per side |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa l2 diffs`

Get L2 tick-level diffs over a time range. Requires Pro+ tier.

```bash
oxa l2 diffs --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | Exchange name |
| `--symbol` | Yes | Trading symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa l3 get`

Get a Lighter L3 order-level orderbook snapshot. Lighter only. Requires Pro+ tier.

```bash
oxa l3 get --symbol <symbol> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--symbol` | Yes | Trading symbol (e.g. BTC, ETH) |
| `--depth` | No | Number of price levels per side |
| `--format` | No | `json` (default) or `pretty` |

**Note:** L3 commands are Lighter-only and do not accept an `--exchange` flag.

### `oxa l3 history`

Get historical Lighter L3 orderbook snapshots over a time range. Lighter only. Requires Pro+ tier.

```bash
oxa l3 history --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--symbol` | Yes | Trading symbol (e.g. BTC, ETH) |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--depth` | No | Number of price levels per side |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

## API Key

The CLI requires an API key. You can provide it in two ways:

1. **Environment variable** (recommended): `export OXA_API_KEY="0xa_your_key"`
2. **Flag**: `--api-key 0xa_your_key`

The `--api-key` flag takes precedence over the environment variable.

Get a free API key at [0xarchive.io](https://0xarchive.io).

## Output Formats

- **`json`** (default): Machine-readable JSON on stdout. Ideal for piping to `jq` or consuming in scripts/agents.
- **`pretty`**: Human-readable colored output with tables.

Errors always go to stderr as structured JSON `{"error":"...","code":2,"type":"validation"}`, never stdout.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `2` | Validation error (bad arguments, unknown command) |
| `3` | Authentication error (missing/invalid key) |
| `4` | Network or API error |
| `5` | Internal error |

## Pagination

Commands that return paginated data include a `nextCursor` field in the JSON response. Pass it back with `--cursor` to fetch the next page:

```bash
# First page
oxa trades fetch --exchange hyperliquid --symbol BTC \
  --start 2026-01-01T00:00:00Z --end 2026-01-02T00:00:00Z --limit 100

# Next page (use nextCursor from previous response)
oxa trades fetch --exchange hyperliquid --symbol BTC \
  --start 2026-01-01T00:00:00Z --end 2026-01-02T00:00:00Z --limit 100 \
  --cursor "eyJ0IjoxNzA..."
```

## For AI Agents

The CLI is designed for agent pipelines:

```bash
# Verify API access
oxa auth test 2>/dev/null && echo "ready"

# Get multi-signal snapshot
oxa summary --exchange hyperliquid --symbol BTC | jq '{price: .markPrice, funding: .fundingRate, oi: .openInterest}'

# Scan all coins
oxa instruments --exchange hyperliquid | jq '.[].name'

# Fetch candles for backtesting
oxa candles --exchange hyperliquid --symbol ETH \
  --start 2026-01-01T00:00:00Z --end 2026-02-01T00:00:00Z \
  --interval 4h --out candles.json

# Check funding across exchanges
oxa funding current --exchange hyperliquid --symbol BTC
oxa funding current --exchange lighter --symbol BTC

# Gate on data freshness before acting
oxa freshness --exchange hyperliquid --symbol BTC | jq '.orderbook.lagMs < 5000'

# Get L4 order-level book reconstruction
oxa l4 get --exchange hyperliquid --symbol BTC --format pretty

# Stream L4 diffs for microstructure analysis
oxa l4 diffs --exchange hyperliquid --symbol BTC \
  --start 2026-03-01T00:00:00Z --end 2026-03-01T01:00:00Z --out l4_diffs.json

# Query order flow aggregation
oxa orders flow --exchange hyperliquid --symbol ETH \
  --start 2026-03-01T00:00:00Z --end 2026-03-02T00:00:00Z --interval 1h

# Get L2 full-depth orderbook
oxa l2 get --exchange hyperliquid --symbol BTC --format pretty

# Get Lighter L3 orderbook snapshot
oxa l3 get --symbol BTC --format pretty
```

## Bulk Data Downloads

For large-scale data exports (full order books, complete trade history, etc.), use the S3 Parquet bulk export available at [0xarchive.io/data](https://0xarchive.io/data). The Data Explorer lets you select time ranges, symbols, and data types, then download compressed Parquet files directly. The CLI is best for point queries and moderate datasets; for bulk needs, the Data Explorer is significantly faster.

## Links

- [API Docs](https://0xarchive.io/docs)
- [TypeScript SDK](https://npmjs.com/package/@0xarchive/sdk)
- [Python SDK](https://pypi.org/project/oxarchive/)
- [MCP Server](https://github.com/0xArchiveIO/0xarchive-mcp)
- [ClawHub Skill](https://clawhub.ai/0xFantomMenace/0xarchive)

## License

MIT
