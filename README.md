# @0xarchive/cli

Terminal-first access to 0xArchive market data.

0xArchive is granular market data infrastructure for two venues: Hyperliquid and Lighter. Lighter has two deployments: mainnet and Robinhood Chain. HIP-3 builder perps, HIP-4 outcome markets, and Hyperliquid Spot live under the Hyperliquid namespace; the CLI exposes `--exchange hip3`, `--exchange hip4`, and the `oxa spot` group as convenience scopes for those markets. Lighter mainnet is `--exchange lighter` and Lighter on Robinhood Chain is `--exchange rh-lighter`.

Use `oxa` when the job starts in a terminal, script, CI task, notebook setup step, Claude Code session, ChatGPT Codex session, or another coding-agent shell. Both coding agents can start here with `oxa auth test` and one market-data request before expanding into SDKs, MCP, skills, or Data Catalog exports. The command set covers order books, trades, candles, funding, open interest, liquidations, prices, freshness, account positions, Lighter L3, Hyperliquid/HIP-3 L4 routes, HIP-4 outcome markets, and Hyperliquid Spot.

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

# Fetch the Lighter on Robinhood Chain order book for a tokenized stock (USDG-quoted)
oxa orderbook get --exchange rh-lighter --symbol AAPL-USDG --format pretty

# Current positions of a Hyperliquid wallet
oxa positions get --exchange hyperliquid --address 0xYourWallet --format pretty

# Fetch Hyperliquid HIP-3 builder-perp candles
oxa candles --exchange hip3 --symbol km:US500 \
  --start 2026-02-28T00:00:00Z --end 2026-03-01T00:00:00Z --interval 1h

# Fetch HIP-4 outcome-market candles (coin 0 = outcome 0 / side 0)
oxa candles --exchange hip4 --symbol 0 \
  --start 2026-05-02T00:00:00Z --end 2026-05-03T00:00:00Z --interval 1h

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

# Stream live Lighter order books (at most one full top-20 book per second by default)
oxa stream orderbook BTC --exchange lighter --duration-ms 10000
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
| Lighter (mainnet) | `--exchange lighter` | `BTC`, `ETH`, etc. |
| Lighter on Robinhood Chain | `--exchange rh-lighter` | USDG-quoted. Perps are uppercase (`BTC`, `ETH`); spot markets are dashed (`AAPL-USDG`). 84 markets: 57 perp, 27 spot. Trades and liquidations from 2026-06-26 20:10:26 UTC (venue launch); order book, OI, and funding from 2026-08-22 18:43 UTC; candles from 2026-06-26 once they are enabled for this deployment. No L3. |
| Hyperliquid HIP-3 | `--exchange hip3` | `km:US500`, `xyz:XYZ100`, etc. Case-sensitive. |
| Hyperliquid HIP-4 | `--exchange hip4` or `oxa hip4 ...` | Bare numerics: `0`, `1`, `42`. Legacy `#0` / `%230` forms still work. `mark_price` is implied probability (0..1), not USD. Per-side OI is available from 2026-05-02 at ~10s cadence; candles are available. No funding or liquidations. |
| Hyperliquid Spot | `oxa spot ...` | Dashed canonical: `HYPE-USDC`, `PURR-USDC`. 326 pairs. Spot candles from 2025-03-22T10:50:22Z at `1m`/`5m`/`15m`/`30m`/`1h`/`4h`/`1d`/`1w`, max 1000 rows; trades from 2025-03-22; orderbook, L4, TWAP live from 2026-05-05. No funding, OI, or liquidations. |

## Plans and Data Access

Every command below works on every plan, including Free. Free includes every market, route, schema, and served depth, with history limited to the most recent rolling 30 days and a maximum 30-day span per request or replay. Build and above keep the full retained archive. Plans gate capacity and Free's 30-day history window, not route families, schemas, or served depth. See [Pricing](https://www.0xarchive.io/pricing) for plan capacity.

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

**Note:** Hyperliquid trades always require `--start` and `--end`. Lighter (both deployments) and HIP-3 can fetch recent trades without a range.

On both Lighter deployments, a ranged request returns canonical trades only, up to a finalization watermark that runs about a day behind: the end of the range is clamped to it, and the JSON output carries `meta.finalizedThrough` (and `meta.clampedTo` when the range was clamped) when the SDK returns them. Without a range, the command returns the recent tier, which is preliminary until the watermark passes it.

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

HIP-4 candles use `/v1/hyperliquid/hip4/candles/{coin}` with the same candle intervals. Hyperliquid Spot candles use the explicit `oxa spot candles <symbol>` command and the `/v1/hyperliquid/spot/candles/{symbol}` route. Candles for Lighter on Robinhood Chain (`--exchange rh-lighter`) cover 2026-06-26 onward once they are enabled for that deployment; until then the request returns an error.

### `oxa funding current`

Get the current funding rate.

```bash
oxa funding current --exchange <exchange> --symbol <symbol> [--format <format>]
```

Cadence guidance: core Hyperliquid funding is approximately 1 minute; Lighter (both deployments) and HIP-3 funding are approximately 10 seconds. HIP-4 has no funding endpoint. On Lighter on Robinhood Chain, funding and open interest cover perps only.

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
| `--interval` | No | Aggregation: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--format` | No | `json` (default) or `pretty` |

### `oxa oi current`

Get current open interest.

```bash
oxa oi current --exchange <exchange> --symbol <symbol> [--format <format>]
```

HIP-4 per-side open interest is available from 2026-05-02 at approximately 10-second cadence. Lighter open interest is also approximately 10 seconds; cadence is data-type specific rather than a generic venue-wide promise.

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
| `--interval` | No | Aggregation: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--format` | No | `json` (default) or `pretty` |

### `oxa instruments`

List all available instruments/coins on an exchange.

```bash
oxa instruments --exchange <exchange> [--format <format>]
```

### `oxa liquidations history`

Get liquidation history for Hyperliquid, HIP-3, and both Lighter deployments. Lighter mainnet liquidations are served from 2026-06-10 and Lighter on Robinhood Chain liquidations from 2026-06-26 20:10:26 UTC, the venue's first trade. A Robinhood Chain range before the first liquidation (2026-06-27 23:14 UTC) returns no rows rather than an error.

```bash
oxa liquidations history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid`, `hip3`, `lighter`, or `rh-lighter` |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--format` | No | `json` (default) or `pretty` |

Lighter liquidation rows keep the trade's raw fields rather than a single liquidated user: `liquidationType`, `price`, `size`, `usdAmount`, the ask and bid accounts and order ids, each side's position before the trade, `txHash`, and `rawJson`, the untouched trade object. Robinhood Chain rows from before live capture (2026-06-27 to 2026-08-22) were backfilled from the venue's finalized export: they carry `source` `bucket` and an empty `rawJson`. Live-captured rows carry `source` `ws` and the venue's raw JSON in `rawJson`.

### `oxa liquidations volume`

Get pre-aggregated liquidation volume in time-bucketed intervals. Hyperliquid and HIP-3 buckets carry total, long, and short USD volume; Lighter buckets (both deployments) carry the total USD volume and a count, with no long/short split.

```bash
oxa liquidations volume --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid`, `hip3`, `lighter`, or `rh-lighter` |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--interval` | No | Aggregation: `1m`, `5m`, `15m`, `30m`, `1h` (default), `4h`, `1d` |
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

Get a combined market summary in one call: mark price, oracle price, open interest, 24h volume, and any available funding or liquidation fields.

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
| `--interval` | No | Aggregation: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--format` | No | `json` (default) or `pretty` |

### `oxa freshness`

Check data freshness across all data types for a symbol.

```bash
oxa freshness --exchange <exchange> --symbol <symbol> [--format <format>]
```

### `oxa positions ...` (account positions)

Open positions, their history, and every change to them, on Hyperliquid, HIP-3, and both Lighter deployments. Hyperliquid and HIP-3 positions are keyed by wallet address (`--address 0x...`); Lighter positions are keyed by integer account index (`--account <index>`). Positions cover perpetual markets; spot and HIP-4 markets have none.

```bash
# Current positions (and account summary) of a wallet or account
oxa positions get --exchange hyperliquid --address 0xYourWallet
oxa positions get --exchange hip3 --address 0xYourWallet --dex xyz
oxa positions get --exchange lighter --account 281474976710654
oxa positions get --exchange rh-lighter --account 42

# Positions as of a past time: state after every event before it
oxa positions get --exchange hyperliquid --address 0xYourWallet --timestamp 2026-08-01T00:00:00Z

# Hourly snapshots and the change log over a range
oxa positions history --exchange lighter --account 42 --start 2026-09-01T00:00:00Z --end 2026-09-02T00:00:00Z
oxa positions changes --exchange hyperliquid --address 0xYourWallet --start 2026-09-01T00:00:00Z --end 2026-09-02T00:00:00Z --symbol BTC

# Every open position in one market, largest first, with totals on the first page
oxa positions market --exchange hyperliquid --symbol BTC --side long --min-value 1000000
oxa positions market --exchange lighter --symbol ETH --hour 2026-09-01T12:00:00Z

# Long/short positioning summary: now, or an hourly series
oxa positions summary --exchange hip3 --symbol xyz:TSLA
oxa positions summary --exchange hyperliquid --symbol BTC --start 2026-09-01T00:00:00Z --end 2026-09-02T00:00:00Z

# Every open position across all markets at one hour (bulk, paginated)
oxa positions all --exchange rh-lighter --hour 2026-09-01T12:00:00Z --limit 2000 --out positions.json

# Account summaries (Hyperliquid and HIP-3)
oxa positions account --exchange hyperliquid --address 0xYourWallet
oxa positions account-history --exchange hyperliquid --address 0xYourWallet --start 2026-09-01T00:00:00Z --end 2026-09-02T00:00:00Z
```

| Subcommand | Venues | Description |
|---|---|---|
| `oxa positions get` | all four | Open positions and the account summary, at the latest snapshot or as of `--timestamp`. Filters: `--symbol`, `--dex` (HIP-3). |
| `oxa positions history` | all four | Hourly position snapshots in `[--start, --end)`. Filters: `--symbol`, `--dex` (HIP-3); `--limit`, `--cursor`. |
| `oxa positions changes` | all four | Change log: every fill leg on the position, with the size before and after, the entry price after, realized PnL, and fees, in `[--start, --end)`. On Lighter, a leg that leaves the size unchanged is included too, with `eventType` `settlement` (the settled side of a market settlement) or `unchanged`. |
| `oxa positions market` | all four | Every open position in one `--symbol`, sorted by position value, at the latest snapshot or at `--hour`. Filters: `--side long` or `--side short`, `--min-value <usd>`, `--include-system` (Lighter). |
| `oxa positions summary` | all four | Long and short counts, sizes, values, average entries, and top-10 share for one `--symbol`: the latest snapshot, or hourly over `--start`/`--end`. |
| `oxa positions all` | all four | Every open position across markets at one `--hour` (an exact UTC hour). |
| `oxa positions account` | `hyperliquid`, `hip3` | Account value, margin, position value, and PnL for one wallet (`--dex` on HIP-3). |
| `oxa positions account-history` | `hyperliquid`, `hip3` | Hourly account summaries in `[--start, --end)`. |

Coverage:

| Venue | Change log from | Hourly snapshots from | Live snapshot |
|---|---|---|---|
| Hyperliquid (`hyperliquid`) | 2025-05-25 | 2026-06-07 | every 5 minutes |
| HIP-3 (`hip3`) | 2025-10-13 | 2026-06-07 | every 5 minutes |
| Lighter mainnet (`lighter`) | 2025-01-17 | 2025-01-17 | every 2 minutes |
| Lighter on Robinhood Chain (`rh-lighter`) | 2026-06-26 | 2026-06-26 | every 2 minutes |

How to read the results:

- The JSON output is `{ "data": ..., "nextCursor": ..., "meta": ... }`. `meta` states what the page describes: `asOf`, `snapshotTs`, `source` (`snapshot` for hourly and live snapshots, `reconstructed` for an as-of time between snapshots, `changes` for the change log), `quality`, `stale`, `builtThrough`, `finalizedThrough`, `totals` (market listings, first page only), and `notice` / `coverageFrom` when a request reaches outside coverage.
- `--timestamp` on `oxa positions get` returns the committed snapshot when it names a snapshot hour, and otherwise a reconstruction: size, entry, and open time are exact, mark fields are taken at that time, and snapshot-only fields are null. A time later than `meta.builtThrough` is clamped to it (`meta.clampedTo`).
- Every row carries its own `quality`, and `meta.quality` is the snapshot's. `meta.stale` is `true`, with a notice, when the latest snapshot is more than 12 minutes old.
- `data.accountSeen` on `oxa positions get` is `flat`, `never_seen`, or `outside_coverage`. `never_seen` means no recorded activity in the covered history, not proof that the account never traded.
- `meta.finalizedThrough` means what it means on Lighter trades: nothing before it will be re-derived. Rows after it can still change.
- Lighter settlement, insurance, and other system accounts are left out of `oxa positions market` and `oxa positions all` unless you pass `--include-system`, and are labelled by `accountKind` everywhere.
- Market and bulk listings are pinned to one snapshot through the cursor. If that snapshot is replaced while you page, the API answers `409` with `snapshot_advanced`; start again without `--cursor`.
- Page sizes: wallet and account routes default to 500 rows (maximum 5,000); market listings default to 100 (maximum 2,000); summary series return at most 168 hours per page; `oxa positions all` returns at most 2,000 rows per page.
- Billing matches trades: one credit per 1,000 rows returned, with a minimum of one credit per request. Account summaries and the Lighter L1 lookup cost one credit per request.

### `oxa accounts by-l1` (Lighter mainnet)

List the Lighter account indices owned by an L1 (Ethereum) address, with the total count. Use the indices with `oxa positions ... --exchange lighter --account <index>`. The lookup is available for Lighter mainnet only.

```bash
oxa accounts by-l1 --l1-address 0xYourL1Address [--limit <n>] [--cursor <cursor>] [--format <format>]
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

Get order history with user attribution. The `oxa orders`, `oxa l4`, and `oxa l2` commands cover Hyperliquid routes (`hyperliquid`, `hip3`, and `hip4` where noted); `--exchange lighter` and `--exchange rh-lighter` are rejected before any request.

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
| `--interval` | No | Bucket width: `1m`, `5m`, `15m`, `1h` (default) |
| `--limit` | No | Maximum number of buckets, oldest first (default 1000, max 10000) |
| `--cursor` | No | Resume point in Unix ms: the response starts at the first bucket that opens after it |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

Buckets are labelled by their open time in UTC, and buckets with no events are omitted.

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

Get an L2 all-level orderbook snapshot derived from L4 data on supported Hyperliquid routes.

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

Get L2 all-level orderbook history over a time range on supported Hyperliquid routes.

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

Get a Lighter L3 order-level orderbook snapshot (maximum 250 orders per side). Lighter mainnet only; Lighter on Robinhood Chain has no L3.

```bash
oxa l3 get --symbol <symbol> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--symbol` | Yes | Trading symbol (e.g. BTC, ETH) |
| `--depth` | No | Maximum orders per side (Lighter cap: 250) |
| `--format` | No | `json` (default) or `pretty` |

**Note:** L3 commands are Lighter-only and do not accept an `--exchange` flag.

### `oxa hip4 ...` (HIP-4 outcome markets)

Explicit HIP-4 command surface. Coins are bare numerics (e.g. `0`, `1`, `42`). HIP-4 candles are available; per-side OI is available from 2026-05-02 at approximately 10-second cadence. HIP-4 has no funding or liquidations. Equivalent to `--exchange hip4` on the shared verbs, but reads more naturally for outcome-market workflows.

```bash
# Discovery
oxa hip4 instruments
oxa hip4 outcomes list --settled false
oxa hip4 outcomes get 0

# Market data
oxa hip4 orderbook get 0 --depth 10
oxa hip4 orderbook history 0 --start 2026-05-02T00:00:00Z --end 2026-05-02T01:00:00Z
oxa hip4 trades 0 --recent --limit 50
oxa hip4 trades 0 --start 2026-05-02T00:00:00Z --end 2026-05-02T01:00:00Z
oxa hip4 candles 0 --start 2026-05-02T00:00:00Z --end 2026-05-03T00:00:00Z --interval 1h
oxa hip4 oi current 0
oxa hip4 oi history 0 --start 2026-05-02T00:00:00Z --end 2026-05-03T00:00:00Z --interval 1h
oxa hip4 prices 0 --start 2026-05-02T00:00:00Z --end 2026-05-03T00:00:00Z --interval 1h
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

Explicit Spot command surface. Symbols are dashed canonical (`HYPE-USDC`, `PURR-USDC`); the server resolves the dashed form to Hyperliquid's wire formats (`PURR/USDC`, `@107`) internally. Spot has no funding, open interest, or liquidations; candles are served through the dedicated Spot route.

Coverage: Spot candles from 2025-03-22T10:50:22Z, with `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, and `1w` intervals and a maximum limit of 1000; trades from 2025-03-22 (HL S3 backfill); orderbook, L4 diffs, L4 orders, and TWAP statuses live from 2026-05-05. 326 pairs covered. Every Spot route is available on every plan, including Free; on Free, history is limited to the most recent rolling 30 days (see [Plans and Data Access](#plans-and-data-access)).

```bash
# Discovery
oxa spot pairs
oxa spot pair HYPE-USDC

# Market data
oxa spot orderbook HYPE-USDC --depth 10
oxa spot trades HYPE-USDC --start 2026-04-01T00:00:00Z --end 2026-04-01T01:00:00Z
oxa spot trades HYPE-USDC --start 2026-04-01T00:00:00Z --end 2026-04-01T01:00:00Z --user 0xabc...
oxa spot candles HYPE-USDC --start 2025-03-22T10:50:22Z --end 2025-03-22T11:50:22Z --interval 1m --limit 1000

# L4 / order lifecycle (live from 2026-05-05)
oxa spot l4 HYPE-USDC
oxa spot orders HYPE-USDC --start 2026-05-05T00:00:00Z --end 2026-05-05T01:00:00Z

# TWAP statuses (live from 2026-05-05)
oxa spot twap HYPE-USDC --start 2026-05-05T00:00:00Z --end 2026-05-05T01:00:00Z
oxa spot twap-user 0xabc... --start 2026-05-05T00:00:00Z --end 2026-05-05T01:00:00Z

# Per-symbol freshness across orderbook, trades, L4, TWAP
oxa spot freshness HYPE-USDC
```

| Subcommand | Description |
|---|---|
| `oxa spot pairs` | List active spot pairs (326) |
| `oxa spot pair <symbol>` | Get a single spot pair |
| `oxa spot candles <symbol>` | Spot OHLCV candles from 2025-03-22T10:50:22Z; intervals `1m` through `1w`, max 1000 rows |
| `oxa spot orderbook <symbol>` | Current spot L2 orderbook (live from 2026-05-05) |
| `oxa spot trades <symbol>` | Spot trade history (S3 backfill from 2025-03-22). Requires `--start`/`--end`; supports `--user` filter. |
| `oxa spot l4 <symbol>` | Spot L4 orderbook reconstruction |
| `oxa spot orders <symbol>` | Spot order lifecycle history with user attribution |
| `oxa spot twap <symbol>` | TWAP statuses for a single pair |
| `oxa spot twap-user <user>` | TWAP statuses for a single user wallet across pairs |
| `oxa spot freshness <symbol>` | Per-symbol freshness across orderbook, trades, L4, TWAP |

For realtime spot streams, use `oxa stream subscribe <channel> <symbol>` with one of `spot_orderbook`, `spot_trades`, `spot_l4_diffs`, `spot_l4_orders`, `spot_twap`. Spot trades and books are also available through `oxa stream trades` and `oxa stream orderbook` with `--exchange spot`. Example:

```bash
oxa stream subscribe spot_trades HYPE-USDC --duration-ms 60000
oxa stream trades HYPE-USDC --exchange spot --duration-ms 60000
```

### `oxa stream ...` (realtime WebSocket)

Stream live market data over a single WebSocket subscription. Output is NDJSON on stdout (one JSON record per line) by default; `--format pretty` adds a one-line summary per event. WebSocket streaming is available on every plan, including Free. Connection counts, subscription caps, and replay speed scale with plan; on Free, replay is limited to the most recent rolling 30 days with a maximum 30-day span per replay (see [Plans and Data Access](#plans-and-data-access)). Each `oxa stream` process opens one WebSocket connection, which counts toward your plan's connection limit; the default endpoint is `wss://api.0xarchive.io/ws`. Requires Node.js 22+ for the global `WebSocket`.

```bash
# Realtime liquidations (Hyperliquid; pass `--exchange hip3` for HIP-3 builder perps)
oxa stream liquidations BTC
oxa stream liquidations km:US500 --exchange hip3

# Realtime trades (channel data is the same fill row used by historical /trades, with `is_liquidation: true` on liquidation fills)
oxa stream trades BTC
oxa stream trades km:US500 --exchange hip3

# Realtime orderbook
oxa stream orderbook BTC --duration-ms 60000

# Lighter (see "Lighter live channels" below)
oxa stream orderbook BTC --exchange lighter                    # at most one full top-20 book per second
oxa stream orderbook BTC --exchange lighter --interval-ms 250  # at most one book every 250 ms
oxa stream trades BTC --exchange lighter
oxa stream subscribe lighter_funding BTC
oxa stream subscribe lighter_open_interest BTC

# Lighter on Robinhood Chain (same message shapes as Lighter mainnet)
oxa stream orderbook AAPL-USDG --exchange rh-lighter --interval-ms 500
oxa stream trades BTC --exchange rh-lighter
oxa stream subscribe rh_lighter_funding BTC
```

| Option | Applies to | Description |
|--------|------------|-------------|
| `--exchange` | `trades`, `orderbook` | `hyperliquid` (default), `hip3`, `lighter`, `rh-lighter`, or `spot` |
| `--exchange` | `liquidations` | `hyperliquid` (default) or `hip3` |
| `--interval-ms` | `orderbook --exchange lighter` or `rh-lighter`, `subscribe lighter_orderbook` or `rh_lighter_orderbook` | Milliseconds between Lighter books, 100 to 5000. Default 1000. Rejected on every other channel. |
| `--duration-ms` | All | Close the stream after N milliseconds and exit with code 0 |
| `--url` | All | Override the WebSocket URL (or set `OXA_WS_URL`) |
| `--format` | All | `json` (NDJSON, default) or `pretty` |

Each `liquidations` / `hip3_liquidations` event is delivered as a fill row with `is_liquidation: true`. To stop early, send SIGINT (Ctrl-C) or pass `--duration-ms`; both exit with code 0. Any error message from the server (for example an unknown symbol, or a notice that your connection fell behind) is written to stderr and the CLI exits with code 4, so a supervising script can restart the stream. The one exception is a Lighter drop notice, which the CLI reports as a warning while the stream continues (see [Lighter live channels](#lighter-live-channels)).

#### Lighter live channels

Live subscriptions are available for four Lighter channels on each deployment:

| Lighter mainnet | Lighter on Robinhood Chain |
|---|---|
| `lighter_orderbook` | `rh_lighter_orderbook` |
| `lighter_trades` | `rh_lighter_trades` |
| `lighter_open_interest` | `rh_lighter_open_interest` |
| `lighter_funding` | `rh_lighter_funding` |

`lighter_candles`, `lighter_l3_orderbook`, and `rh_lighter_candles` support historical replay only; the CLI rejects them before opening a socket and points to `oxa candles --exchange lighter|rh-lighter` and `oxa l3 get` / `oxa l3 history`. Robinhood Chain has no L3 channel.

Lighter live data, for both deployments, is served on `wss://api.0xarchive.io/ws`, the CLI default. It is available on every plan, and every live Lighter message is metered per message, the same as Hyperliquid live data. `stream.0xarchive.io` carries a subset of Hyperliquid live channels and no Lighter channels; a Lighter subscribe there returns an error pointing to `wss://api.0xarchive.io/ws`.

The `rh_lighter_*` channels send exactly the same message shapes as the matching `lighter_*` channels below, with Robinhood Chain symbols and USDG-quoted prices. Everything in this section applies to both deployments, including `--interval-ms` on the book channel and drop notices.

Symbols are the same as `oxa instruments --exchange lighter` (or `--exchange rh-lighter`). They are case-insensitive on subscribe and echoed uppercase. Messages use the same envelope as Hyperliquid live data. Example messages (the book is cut to one level per side here; the trade is one trade, two fills):

```json
{"type":"data","channel":"lighter_orderbook","coin":"BTC","symbol":"BTC","data":{"coin":"BTC","time":1790294171459,"levels":[[{"px":"84368.7","sz":"0.00020","n":1}],[{"px":"84368.8","sz":"0.05720","n":1}]]}}
{"type":"data","channel":"lighter_trades","coin":"BTC","symbol":"BTC","data":[{"coin":"BTC","side":"A","px":"84367.9","sz":"0.00003","time":1790294182211,"hash":"0000001dc8774b28000001a0d5d94943000000000000000000000000000000000000000000000000","tid":31944180930,"oid":562953419896990,"crossed":false,"dir":null,"fee":null,"fee_token":null,"closed_pnl":null,"start_position":"109.79011","users":["281474976623827"]},{"coin":"BTC","side":"B","px":"84367.9","sz":"0.00003","time":1790294182211,"hash":"0000001dc8774b28000001a0d5d94943000000000000000000000000000000000000000000000000","tid":31944180930,"oid":844421425107071,"crossed":true,"dir":null,"fee":null,"fee_token":null,"closed_pnl":null,"start_position":"0.03940","users":["713845"]}]}
{"type":"data","channel":"lighter_funding","coin":"BTC","symbol":"BTC","data":{"coin":"BTC","ctx":{"openInterest":"172706178.266310","funding":"0.000012","premium":"-0.000327","markPx":"84363.5","oraclePx":"84397.0","midPx":"84368.8","dayNtlVlm":"908611371.550746","dayBaseVlm":"10808.97087","prevDayPx":"84285.9","impactPxs":null}}}
```

- **`lighter_orderbook`**: every message is a full book of up to 20 levels per side, not a diff. `levels[0]` holds bids, best (highest) first, and `levels[1]` holds asks, best (lowest) first. `px` and `sz` are decimal strings exactly as Lighter publishes them, and `n` is always `1` because Lighter does not publish per-level order counts. `time` is Lighter's book update time in milliseconds. The server sends the newest book at most once per interval: once a second by default, or every `--interval-ms` (100 to 5000). Each book sent is one metered message. On subscribe, the current book is sent immediately when one is available; illiquid markets can go minutes without a change. A slow reader receives fewer books, never an older book in place of a newer one.
- **`lighter_trades`**: `data` is an array of fills with two fills per trade, one per side, sharing a `tid`. `side` is `A` (ask side) or `B` (bid side), `crossed: true` marks the taker leg, `users` holds the Lighter account index as a string, `oid` is that side's order id, `start_position` is that account's signed position before the trade, `hash` is the Lighter transaction hash, and `time` is in milliseconds. `fee`, `fee_token`, `closed_pnl`, and `dir` are always `null` in live messages because Lighter's live stream does not carry them. Count trades by distinct `tid`, not by array length, and compute volume from one leg per `tid`. Live trades are delivered as they happen and are preliminary. The finalized record, including fees, comes from `oxa trades fetch --exchange lighter --symbol BTC --start ... --end ...`, which returns reconciled trades only; without a range, `oxa trades fetch --exchange lighter --symbol BTC` returns the preliminary recent tier.
- **`lighter_open_interest`** and **`lighter_funding`** carry the same message, a `ctx` object of market stats, so one subscription is enough; subscribing to both delivers, and meters, every update twice. `openInterest` is Lighter's reported open interest, the same quantity `oxa oi current --exchange lighter --symbol BTC` returns. `funding` is Lighter's current funding rate as a fraction (Lighter publishes percent; the value is divided by 100), in the same units as `oxa funding current --exchange lighter --symbol BTC`, and `premium` is also a fraction. `markPx` is the mark price, `oraclePx` is Lighter's index price, `midPx` is the mid price, `dayNtlVlm` and `dayBaseVlm` are 24h quote and base volume, `prevDayPx` is derived from the last trade price and Lighter's 24h percent change, and `impactPxs` is always `null` (Lighter has no impact prices). Updates arrive as Lighter publishes them, about once per second per market, and the latest values are sent on subscribe when available.

If your connection falls behind `lighter_trades` or the stats channels, the server sends an error notice (for example `Dropped ~N live lighter_trades messages for BTC: your connection fell behind the Lighter stream, and those trades were not delivered.`) and keeps the subscription running. The CLI writes that notice to stderr as a warning line (`{"warning":"stream warning: Dropped ~N ...","type":"lag"}`) and keeps streaming; missed trades are not resent. If the lag persists, the server stops the subscription (`Stopped the lighter_trades stream for BTC: your connection is too slow to keep up. Re-subscribe to resume.`) and the CLI exits with code 4, like any other server error.

WebSocket replay of all six Lighter mainnet channels, and of the five Robinhood Chain channels, keeps the existing `historical_data` row shapes, which differ from the live shapes above. The CLI does not start replays; use an SDK or the WebSocket API directly for replay.

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

# Stream live Lighter trades for 60s, then count distinct trades (two fills per trade)
oxa stream trades BTC --exchange lighter --duration-ms 60000 \
  | jq -s '[.[].data[].tid] | unique | length'

# Lighter on Robinhood Chain: tokenized-stock book and funding
oxa orderbook get --exchange rh-lighter --symbol AAPL-USDG
oxa funding current --exchange rh-lighter --symbol BTC

# Positions: a wallet's open positions, and the largest BTC longs right now
oxa positions get --exchange hyperliquid --address 0xYourWallet | jq '.data.positions[] | {symbol, size, unrealizedPnl}'
oxa positions market --exchange hyperliquid --symbol BTC --side long --limit 10

# Lighter: find a wallet's account indices, then read one account's positions
oxa accounts by-l1 --l1-address 0xYourL1Address | jq '.data.accounts[].accountIndex'
oxa positions get --exchange lighter --account 42

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

For large-scale data exports (route-specific order books, fill-level trade history, and other retained datasets), use the [Data Catalog](https://www.0xarchive.io/data). It lets you choose markets, datasets, and date ranges, see a live quote, and export zstd-compressed Parquet. The CLI is best for point queries and moderate datasets; the Data Catalog is the file-export path.

## Links

- [API Docs](https://www.0xarchive.io/docs)
- [Python SDK](https://pypi.org/project/oxarchive/)
- [TypeScript SDK](https://npmjs.com/package/@0xarchive/sdk)
- [Rust SDK](https://crates.io/crates/oxarchive)
- [MCP Server](https://mcp.0xarchive.io)
- [0xArchive Skill](https://github.com/0xArchiveIO/0xarchive-skill)
- [Examples](https://github.com/0xArchiveIO/examples)

## License

MIT
