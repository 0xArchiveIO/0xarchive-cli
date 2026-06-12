# @0xarchive/cli

Terminal-first access to 0xArchive market data.

0xArchive is granular market data infrastructure for Hyperliquid and Lighter.xyz. HIP-3 builder perps, HIP-4 outcome markets, and Hyperliquid Spot live under the Hyperliquid namespace; the CLI exposes `--exchange hip3`, `--exchange hip4`, and the `oxa spot` group as convenience scopes for those markets.

Use `oxa` when the job starts in a terminal, script, CI task, notebook setup step, Claude Code session, ChatGPT Codex session, or another coding-agent shell. Both coding agents can start here with `oxa auth test` and one market-data request before expanding into SDKs, MCP, skills, or Data Catalog exports. The command set covers order books, trades, candles, funding, open interest, liquidations, prices, freshness, Lighter L3, Hyperliquid/HIP-3 L4 routes, HIP-4 outcome markets, and Hyperliquid Spot.

## Install

```bash
npm install @0xarchive/cli
```

Or run without installing:

```bash
npx @0xarchive/cli auth test --exchange hyperliquid --symbol BTC
```

## First Request

```bash
# Create a free account, then copy an API key:
# https://www.0xarchive.io/signup
export OXA_API_KEY="0xa_your_api_key"

# Verify your key works
oxa auth test

# Fetch the current Hyperliquid BTC order book
oxa orderbook get --exchange hyperliquid --symbol BTC --format pretty

# Fetch recent Lighter trades
oxa trades fetch --exchange lighter --symbol BTC --limit 50

# Fetch Hyperliquid HIP-3 builder-perp candles
oxa candles --exchange hip3 --symbol km:US500 \
  --start 2026-02-28T00:00:00Z --end 2026-03-01T00:00:00Z --interval 1h

# List active HIP-4 outcome markets, then inspect one
oxa hip4 outcomes list --settled false
oxa hip4 outcomes get 0

# Pull the current HIP-4 orderbook for outcome 0 / side 0
oxa hip4 orderbook get 0

# List Hyperliquid Spot pairs and inspect one
oxa spot pairs
oxa spot pair HYPE-USDC

# Stream live Hyperliquid liquidations (requires Node 22+)
oxa stream liquidations BTC
```

## Choose Your Next Path

- First authenticated route: [Quick Start](https://www.0xarchive.io/docs/quick-start)
- Full CLI guide: [CLI docs](https://www.0xarchive.io/docs/cli)
- Claude Code, ChatGPT Codex, and coding-agent workflows: [AI Clients](https://www.0xarchive.io/docs/ai-clients)
- File-based pulls: [Data Catalog](https://www.0xarchive.io/data)
- Plans and limits: [Pricing](https://www.0xarchive.io/pricing)
- Machine-readable docs: [llms.txt](https://www.0xarchive.io/llms.txt) and [OpenAPI](https://www.0xarchive.io/openapi.json)

## Venue Scopes

| Scope | Flag | Symbols |
| --- | --- | --- |
| Hyperliquid | `--exchange hyperliquid` | `BTC`, `ETH`, `SOL`, etc. |
| Lighter.xyz | `--exchange lighter` | `BTC`, `ETH`, etc. |
| Hyperliquid HIP-3 | `--exchange hip3` | `km:US500`, `xyz:XYZ100`, etc. Case-sensitive. |
| Hyperliquid HIP-4 | `--exchange hip4` or `oxa hip4 ...` | Bare numerics: `0`, `1`, `42`. Legacy `#0` / `%230` forms still work. `mark_price` is implied probability (0..1), not USD. No funding, liquidations, or candles. |
| Hyperliquid Spot | `oxa spot ...` | Dashed canonical: `HYPE-USDC`, `PURR-USDC`. 294 pairs. Trades from 2025-03-22; orderbook, L4, TWAP live from 2026-05-05. No funding, OI, liquidations, or candles. |

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

### `oxa outcomes list` (HIP-4 only)

List HIP-4 outcome markets (binary outcome metadata).

```bash
oxa outcomes list [--settled true|false|all] [--limit <n>] [--cursor <cursor>] [--format <format>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--settled` | No | Filter: `true`, `false`, or `all` (default) |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor from previous response |
| `--format` | No | `json` (default) or `pretty` |

### `oxa outcomes get` (HIP-4 only)

Get a single HIP-4 outcome market detail. The response includes `aggregated_oi` (latest both-sides OI snapshot).

```bash
oxa outcomes get <outcome_id> [--format <format>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `outcome_id` | Yes | Numeric outcome id (e.g. `0`, `1`, `42`) |
| `--format` | No | `json` (default) or `pretty` |

### `oxa orders history`

Get order history with user attribution.

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

Get order flow aggregation.

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

Get TP/SL (take-profit / stop-loss) order history.

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

Get an L4 order-level orderbook reconstruction at a point in time.

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

Get L4 orderbook diffs (individual order-level changes) over a time range.

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

Get L4 orderbook checkpoints (full snapshots at periodic intervals) over a time range.

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

Get an L2 full-depth orderbook snapshot derived from L4 data.

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

Get L2 full-depth orderbook history over a time range.

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

Get L2 tick-level diffs over a time range.

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

Get a Lighter L3 order-level orderbook snapshot. Lighter only.

```bash
oxa l3 get --symbol <symbol> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--symbol` | Yes | Trading symbol (e.g. BTC, ETH) |
| `--depth` | No | Number of price levels per side |
| `--format` | No | `json` (default) or `pretty` |

**Note:** L3 commands are Lighter-only and do not accept an `--exchange` flag.

### `oxa hip4 ...` (HIP-4 outcome markets)

Explicit HIP-4 command surface. Coins are bare numerics (e.g. `0`, `1`, `42`). HIP-4 has no funding, liquidations, or candles by design. Equivalent to `--exchange hip4` on the shared verbs, but reads more naturally for outcome-market workflows.

```bash
# Discovery
oxa hip4 instruments
oxa hip4 outcomes list --settled false
oxa hip4 outcomes get 0

# Market data
oxa hip4 orderbook get 0 --depth 10
oxa hip4 orderbook history 0 --start 2026-04-01T00:00:00Z --end 2026-04-01T01:00:00Z
oxa hip4 trades 0 --recent --limit 50
oxa hip4 trades 0 --start 2026-04-01T00:00:00Z --end 2026-04-01T01:00:00Z
oxa hip4 oi current 0
oxa hip4 oi history 0 --start 2026-04-01T00:00:00Z --end 2026-04-02T00:00:00Z --interval 1h
oxa hip4 prices 0 --start 2026-04-01T00:00:00Z --end 2026-04-02T00:00:00Z --interval 1h
oxa hip4 summary 0
oxa hip4 freshness 0

# Order-level
oxa hip4 orders history 0 --start ... --end ...
oxa hip4 orders flow    0 --start ... --end ... --interval 1h
oxa hip4 orders tpsl    0 --start ... --end ...
oxa hip4 l4 get      0
oxa hip4 l4 diffs    0 --start ... --end ...
oxa hip4 l4 history  0 --start ... --end ...
```

### `oxa spot ...` (Hyperliquid Spot)

Explicit Spot command surface. Symbols are dashed canonical (`HYPE-USDC`, `PURR-USDC`); the server resolves the dashed form to Hyperliquid's wire formats (`PURR/USDC`, `@107`) internally. Spot has no funding, open interest, liquidations, or candles by design (those are perpetual constructs).

Coverage: trades from 2025-03-22 (HL S3 backfill); orderbook, L4 diffs, L4 orders, and TWAP statuses live from 2026-05-05. 294 pairs covered. All markets and schemas (including L4 and order lifecycle) are available on every tier.

```bash
# Discovery
oxa spot pairs
oxa spot pair HYPE-USDC

# Market data
oxa spot orderbook HYPE-USDC --depth 10
oxa spot trades HYPE-USDC --start 2026-04-01T00:00:00Z --end 2026-04-01T01:00:00Z
oxa spot trades HYPE-USDC --start 2026-04-01T00:00:00Z --end 2026-04-01T01:00:00Z --user 0xabc...

# L4 / order lifecycle (live from 2026-05-05)
oxa spot l4 HYPE-USDC
oxa spot orders HYPE-USDC --start 2026-05-05T00:00:00Z --end 2026-05-05T01:00:00Z

# TWAP statuses (live from 2026-05-05)
oxa spot twap HYPE-USDC --start 2026-05-05T00:00:00Z --end 2026-05-05T01:00:00Z
oxa spot twap-user 0xabc... --start 2026-05-05T00:00:00Z --end 2026-05-05T01:00:00Z

# Per-symbol freshness across orderbook, trades, L4, TWAP
oxa spot freshness HYPE-USDC
```

| Subcommand | Description | Tier |
|---|---|---|
| `oxa spot pairs` | List every active spot pair (294) | All |
| `oxa spot pair <symbol>` | Get a single spot pair | All |
| `oxa spot orderbook <symbol>` | Current spot L2 orderbook (live from 2026-05-05) | All |
| `oxa spot trades <symbol>` | Spot trade history (S3 backfill from 2025-03-22). Requires `--start`/`--end`; supports `--user` filter. | All |
| `oxa spot l4 <symbol>` | Spot L4 orderbook reconstruction | All |
| `oxa spot orders <symbol>` | Spot order lifecycle history with user attribution | All |
| `oxa spot twap <symbol>` | TWAP statuses for a single pair | All |
| `oxa spot twap-user <user>` | TWAP statuses for a single user wallet across all pairs | All |
| `oxa spot freshness <symbol>` | Per-symbol freshness across orderbook, trades, L4, TWAP | All |

For realtime spot streams, use `oxa stream subscribe <channel> <symbol>` with one of `spot_orderbook`, `spot_trades`, `spot_l4_diffs`, `spot_l4_orders`, `spot_twap`. Example:

```bash
oxa stream subscribe spot_trades HYPE-USDC --duration-ms 60000
```

### `oxa stream ...` (realtime WebSocket)

Stream live market data over a single WebSocket subscription. Output is NDJSON on stdout (one JSON record per line) by default; `--format pretty` adds a one-line summary per event. WebSocket access is available on every tier, starting with Free (10 subscriptions / 2 connections). Requires Node.js 22+ for the global `WebSocket`.

```bash
# Realtime liquidations (Hyperliquid; pass `--exchange hip3` for HIP-3 builder perps)
oxa stream liquidations BTC
oxa stream liquidations km:US500 --exchange hip3

# Realtime trades (channel data is the same fill row used by historical /trades, with `is_liquidation: true` on liquidation fills)
oxa stream trades BTC

# Realtime orderbook
oxa stream orderbook BTC --duration-ms 60000
```

Each `liquidations` / `hip3_liquidations` event is delivered as a fill row with `is_liquidation: true`. To stop early, send SIGINT (Ctrl-C) or pass `--duration-ms`.

### `oxa l3 history`

Get historical Lighter L3 orderbook snapshots over a time range. Lighter only.

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

The CLI is designed for Claude Code, ChatGPT Codex, CI, cron, notebook setup, and other coding-agent pipelines. For richer typed context inside the agent, pair the CLI with the [0xArchive skill](https://github.com/0xArchiveIO/0xarchive-skill), which installs into `.claude/skills/0xarchive` (Claude Code) or `.agents/skills/0xarchive` (ChatGPT Codex). If you manage skills through OpenClaw, `openclaw install 0xarchive` is the optional helper. With the skill loaded, an agent can run `oxa auth test` to verify access and then issue any market-data command below:

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

# Stream live liquidations (NDJSON to stdout) for 60s, then exit
oxa stream liquidations BTC --duration-ms 60000

# HIP-4 outcome markets (bare numeric coins)
oxa hip4 outcomes list --settled false
oxa hip4 orderbook get 0 --depth 10
oxa hip4 trades 0 --recent --limit 50

# Hyperliquid Spot (dashed canonical symbols)
oxa spot pairs | jq '.[].symbol' | head
oxa spot pair HYPE-USDC | jq '{symbol, baseTokenName, quoteTokenName}'
oxa spot orderbook HYPE-USDC --depth 5
oxa spot trades HYPE-USDC --start 2026-04-01T00:00:00Z --end 2026-04-01T01:00:00Z --out hype_trades.json
```

## Data Catalog

For large-scale data exports (full order books, complete trade history, etc.), use the [Data Catalog](https://www.0xarchive.io/data). It lets you choose markets, datasets, and date ranges, see a live quote, and export zstd-compressed Parquet. The CLI is best for point queries and moderate datasets; the Data Catalog is the file-export path.

## Links

- [API Docs](https://www.0xarchive.io/docs)
- [Python SDK](https://pypi.org/project/oxarchive/)
- [TypeScript SDK](https://npmjs.com/package/@0xarchive/sdk)
- [Rust SDK](https://crates.io/crates/oxarchive)
- [MCP Server](https://mcp.0xarchive.io) (or [self-host](https://npmjs.com/package/@0xarchive/mcp-server))
- [0xArchive Skill](https://github.com/0xArchiveIO/0xarchive-skill)
- [Examples](https://github.com/0xArchiveIO/examples)

## License

MIT
