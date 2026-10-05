# @0xarchive/cli

Terminal-first access to 0xArchive market data.

0xArchive is granular market data infrastructure for two venues: Hyperliquid and Lighter. Lighter has two deployments: mainnet and Robinhood Chain. HIP-3 builder perps, HIP-4 outcome markets, and Hyperliquid Spot live under the Hyperliquid namespace; the CLI exposes them as `--exchange hip3`, `--exchange hip4`, and `--exchange spot`, with the `oxa hip4` and `oxa spot` groups for the data only those venues have. Lighter mainnet is `--exchange lighter` and Lighter on Robinhood Chain is `--exchange rh-lighter`. Account positions (`oxa positions ...`) cover Hyperliquid, HIP-3, and both Lighter deployments.

Use `oxa` when the job starts in a terminal, script, CI task, notebook setup step, Claude Code session, ChatGPT Codex session, or another coding-agent shell. Both coding agents can start here with `oxa auth test` and one market-data request before expanding into SDKs, MCP, skills, or Data Catalog exports. The command set covers order books, trades, candles, funding, open interest, liquidations, prices, freshness, Lighter L3, Hyperliquid/HIP-3 L4 routes, HIP-4 outcome markets, and Hyperliquid Spot, plus market breadth, cumulative volume delta, liquidation and trigger levels, the HIP-3 oracle, wallet classification, the symbol list, what each venue serves (`oxa capabilities`), webhooks, and WebSocket replay.

## Install

Install it globally so the `oxa` command is on your `PATH`:

```bash
npm install -g @0xarchive/cli
oxa --version
```

Or run it without installing:

```bash
npx @0xarchive/cli auth test --exchange hyperliquid --symbol BTC
```

The CLI needs Node.js 18 or later; the WebSocket commands (`oxa stream ...`) need Node.js 22 or later.

## First Request

```bash
# Create a free account, then copy an API key:
# https://www.0xarchive.io/signup
export OXA_API_KEY="0xa_your_api_key"

# Verify your key works
oxa auth test

# What each venue serves, over REST and WebSocket, and from when (no key needed)
oxa capabilities --exchange hip3 --format pretty

# Time windows used by the examples in this README, in Unix milliseconds,
# relative to now so they stay inside every plan's history window (Free keeps
# the most recent 30 days)
NOW=$(( $(date +%s) * 1000 ))
HOUR_AGO=$(( NOW - 3600000 ))
DAY_AGO=$(( NOW - 86400000 ))
WEEK_AGO=$(( NOW - 604800000 ))
LAST_HOUR=$(( NOW / 3600000 * 3600000 - 3600000 ))   # the last whole UTC hour

# Fetch the current Hyperliquid BTC order book
oxa orderbook get --exchange hyperliquid --symbol BTC --format pretty

# Fetch recent Lighter trades, and only the sells on a HIP-3 market
oxa trades history --exchange lighter --symbol BTC --limit 50
oxa trades history --exchange hip3 --symbol xyz:TSLA --side sell --limit 50

# Fetch the Lighter on Robinhood Chain order book for a tokenized stock (USDG-quoted)
oxa orderbook get --exchange rh-lighter --symbol AAPL-USDG --format pretty

# The largest open BTC longs on Hyperliquid right now
oxa positions market --exchange hyperliquid --symbol BTC --side long --limit 10 --format pretty

# Hourly HIP-3 builder-perp candles for the last day
oxa candles history --exchange hip3 --symbol xyz:TSLA --start $DAY_AGO --end $NOW --interval 1h --format pretty

# HIP-4 outcome markets settle, and new ones are listed, every day. List the open ones:
oxa hip4 outcomes list --settled false --limit 20 --format pretty

# Then use an outcome id. Here jq picks today's BTC price outcome from the
# instrument list and keeps the coin of its Yes side (10 x outcome id + side):
COIN=$(oxa hip4 instruments | jq -r '[.[] | select(.isSettled == false and .recurringUnderlying == "BTC" and .side == 0)][0].symbol | ltrimstr("#")')
oxa hip4 outcomes get $(( COIN / 10 )) --format pretty
oxa hip4 orderbook get "$COIN" --format pretty
oxa candles history --exchange hip4 --symbol "$COIN" --start $HOUR_AGO --end $NOW --interval 5m --format pretty

# List Hyperliquid Spot pairs and inspect one
oxa spot pairs
oxa spot pairs get HYPE-USDC

# Share of HIP-3 markets trading above their session VWAP
oxa breadth current --exchange hip3 --format pretty

# Hourly cumulative volume delta for BTC over the last day
oxa cvd history --exchange hyperliquid --symbol BTC --start $DAY_AGO --end $NOW

# Every symbol with its coverage dates, for one venue
oxa symbols list --exchange hip3 --format pretty

# Stream live Hyperliquid liquidations for a minute (Node.js 22 or later)
oxa stream liquidations BTC --duration-ms 60000

# Stream live Lighter order books for 10 seconds (at most one full top-20 book per second by default)
oxa stream orderbook BTC --exchange lighter --duration-ms 10000
```

The examples in the rest of this README use `NOW`, `HOUR_AGO`, `DAY_AGO`, `WEEK_AGO`, `LAST_HOUR`, and `COIN` as set above; `--start` and `--end` also accept ISO 8601 times.

## Choose Your Next Path

- First authenticated route: [Quick Start](https://docs.0xarchive.io/quickstart)
- Full CLI guide: [CLI docs](https://docs.0xarchive.io/cli)
- Claude Code, ChatGPT Codex, and coding-agent workflows: [AI Clients](https://docs.0xarchive.io/ai-clients)
- File-based pulls: [Data Catalog](https://www.0xarchive.io/data)
- Plans and limits: [Pricing](https://www.0xarchive.io/pricing)
- Machine-readable docs: [llms.txt](https://www.0xarchive.io/llms.txt) and [OpenAPI](https://www.0xarchive.io/openapi.json)

## Venue Scopes

| Scope | Flag | Symbols |
| --- | --- | --- |
| Hyperliquid | `--exchange hyperliquid` | `BTC`, `ETH`, `SOL`, etc. |
| Lighter (mainnet) | `--exchange lighter` | `BTC`, `ETH`, etc. |
| Lighter on Robinhood Chain | `--exchange rh-lighter` | USDG-quoted. Perps are uppercase (`BTC`, `ETH`); spot markets are dashed (`AAPL-USDG`); `oxa instruments list --exchange rh-lighter` returns the current set. Trades and liquidations from 2026-06-26 20:10:26 UTC (venue launch); candles from 2026-06-26 20:10 UTC; order book, OI, and funding from 2026-08-22 18:43 UTC. No L3. |
| Hyperliquid HIP-3 | `--exchange hip3` | `xyz:TSLA`, `xyz:XYZ100`, etc. Case-sensitive. |
| Hyperliquid HIP-4 | `--exchange hip4` or `oxa hip4 ...` | Side coins as bare numerics: 10 times the outcome id plus the side, e.g. `82260` for outcome 8226, Yes. The `#82260` / `%2382260` forms still work. `mark_price` is implied probability (0..1), not USD. Trades and candles from 2026-05-02 08:00 UTC; order book, per-side OI (about every 10 seconds), and prices from 2026-05-02 16:51 UTC. No funding or liquidations. |
| Hyperliquid Spot | `--exchange spot` or `oxa spot ...` | Dashed canonical: `HYPE-USDC`, `PURR-USDC`; `oxa spot pairs` lists the current set. Spot candles from 2025-03-22 10:50 UTC at `1m`/`5m`/`15m`/`30m`/`1h`/`4h`/`1d`/`1w`, max 1000 rows; trades from 2025-03-22 10:50:22 UTC; TWAP statuses (REST only) from 2026-05-05 13:05 UTC; order book from 2026-05-05 19:56 UTC; L4 from 2026-05-05 22:57 UTC. No funding, OI, or liquidations. |

## Command Grammar

Commands follow one grammar. A datatype that more than one venue serves is `oxa <datatype> <verb> --exchange <venue>`, with four verbs: `get` for a point-in-time read, `current` for the latest value, `history` for a paged series, and `list` for a catalog:

```bash
oxa trades history --exchange spot --symbol HYPE-USDC --start $HOUR_AGO --end $NOW
oxa orderbook history --exchange hip4 --symbol "$COIN" --start $HOUR_AGO --end $NOW --depth 5
oxa instruments list --exchange rh-lighter
```

A datatype that only one venue serves sits under that venue: `oxa hip4 outcomes`, `oxa hip4 questions`, `oxa spot pairs`, `oxa spot twap`, `oxa hip3 oracle`, `oxa lighter l3`, and `oxa lighter accounts`.

The earlier forms keep working and run the same commands: `oxa trades fetch` (`oxa trades history`), `oxa candles`, `oxa prices`, and `oxa cvd <symbol>` (their `history`), `oxa summary` and `oxa freshness` (their `get`), `oxa instruments` and `oxa symbols` (their `list`), `oxa l3 ...` and `oxa accounts by-l1` (under `oxa lighter`), `oxa outcomes ...` (under `oxa hip4`), `oxa spot pair <symbol>` (`oxa spot pairs get`), and the Spot and HIP-4 market-data commands under `oxa spot` and `oxa hip4`.

Which venue serves which datatype, over REST and WebSocket, and from when, is `oxa capabilities`.

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

### `oxa capabilities`

What each venue serves: one row per venue and datatype, with the REST routes, the WebSocket channels and whether they stream live and replay, the first served instant (`availableFrom`), cadence, page limit, accepted intervals, and notes. This is the same table the stream and replay commands follow. The route is public, so no API key is needed.

```bash
oxa capabilities --format pretty
oxa capabilities --exchange spot --format pretty
oxa capabilities --exchange hip3 --datatype l4_diffs --format pretty
oxa capabilities | jq '[.[] | select(.replay) | .wsChannels[]]'
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | No | Keep one venue: `hyperliquid`, `hip3`, `hip4`, `spot`, `lighter`, or `rh-lighter` |
| `--datatype` | No | Keep one datatype, e.g. `trades`, `l4_diffs`, `oi`. An unknown datatype exits with code 2 and names the ones the venue serves. |
| `--api-key` | No | API key (or `OXA_API_KEY`); not required |
| `--format` | No | `json` (default, an array of rows) or `pretty` (a table, or every field of a single row) |

### `oxa orderbook get`

Get an orderbook snapshot for a symbol. `--exchange spot` reads the Hyperliquid Spot book.

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

Get historical orderbook snapshots over a time range, on every venue including `--exchange spot`. `--depth` caps the price levels per side on every venue.

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

### `oxa trades history` (also `oxa trades fetch`)

Fetch trade history for a symbol, on every venue including `--exchange spot`. `oxa trades fetch` is the same command.

```bash
oxa trades history --exchange <exchange> --symbol <symbol> [options]
oxa trades history --exchange hyperliquid --symbol BTC --start $HOUR_AGO --end $NOW --side buy
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid`, `hip3`, `hip4`, `spot`, `lighter`, or `rh-lighter` |
| `--symbol` | Yes | Coin symbol |
| `--start` | Conditional | Start time (ISO 8601 or Unix ms) |
| `--end` | Conditional | End time (ISO 8601 or Unix ms) |
| `--side` | No | `buy` or `sell`: keep one taker side. The API applies the filter, so a full page holds `--limit` matching trades and the cursor pages the filtered tape. |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor from previous response |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

**Note:** Hyperliquid trades always require `--start` and `--end`. Every other venue (HIP-3, HIP-4, Spot, and both Lighter deployments) fetches its most recent trades without a range, and `--side` filters those too.

On both Lighter deployments, a ranged request returns canonical trades only, up to a finalization watermark that runs about a day behind: the end of the range is clamped to it, and the JSON output carries `meta.finalizedThrough` (and `meta.clampedTo` when the range was clamped) when the SDK returns them. Without a range, the command returns the recent tier, which is preliminary until the watermark passes it.

### `oxa candles history` (also `oxa candles`)

Get OHLCV candle data. `oxa candles --exchange ...` runs the same command.

```bash
oxa candles history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid`, `hip3`, `hip4`, `spot`, `lighter`, or `rh-lighter` |
| `--symbol` | Yes | Coin symbol |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--interval` | No | `1m`, `5m`, `15m`, `30m`, `1h` (default), `4h`, `1d`, `1w` |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

HIP-4 candles use `/v1/hyperliquid/hip4/candles/{coin}` with the same candle intervals. Hyperliquid Spot candles (`--exchange spot`, or `oxa spot candles <symbol>`) use the `/v1/hyperliquid/spot/candles/{symbol}` route, with at most 1000 rows per page. Candles for Lighter on Robinhood Chain (`--exchange rh-lighter`) start at 2026-06-26 20:10 UTC.

### `oxa breadth current` and `oxa breadth history`

Market breadth: the percentage of eligible instruments whose price is above their current UTC-session VWAP, on Hyperliquid (`--exchange hyperliquid`) and HIP-3 (`--exchange hip3`). The session resets at 00:00 UTC. Instruments with no session volume, or whose last completed candle is stale, are excluded and counted in `counts`; `coverageRatio` is eligible over candidates. When no instrument is eligible, `valuePct` is `null`, never 0: the JSON output keeps it `null` and pretty output prints `null`. HIP-3 snapshots also carry per-builder counts in `namespaces`. History begins 2026-08-24 on Hyperliquid and 2026-08-28 on HIP-3.

```bash
oxa breadth current --exchange hyperliquid
oxa breadth history --exchange hip3 --start $DAY_AGO --end $NOW --interval 1h
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid` or `hip3` |
| `--start` | No (`history`) | Start time (ISO 8601 or Unix ms); defaults to the route window |
| `--end` | No (`history`) | End time (ISO 8601 or Unix ms); defaults to now |
| `--interval` | No (`history`) | Downsampling: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`. Each bucket keeps its last snapshot; percentages are never averaged. |
| `--limit` | No (`history`) | Snapshots per page, 1 to 1,000 |
| `--cursor` | No (`history`) | Pagination cursor from the previous response |
| `--out` | No (`history`) | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa cvd history` (also `oxa cvd <symbol>`)

Cumulative volume delta for one market on Hyperliquid or HIP-3: taker buy and sell notional per bucket (`buyVolume`, `sellVolume`), their difference (`delta`), and a running total (`cumulativeDelta`). Buckets are labelled by their open time in UTC (`timestamp`, an RFC 3339 string, with the same instant in Unix ms as `timestampMs`) and are omitted when they hold no trades. `oxa cvd <symbol> --exchange ...` runs the same command.

```bash
oxa cvd history --exchange <exchange> --symbol <symbol> [options]
oxa cvd history --exchange hyperliquid --symbol BTC --start $DAY_AGO --end $NOW --interval 5m
oxa cvd xyz:SP500 --exchange hip3
```

| Option | Required | Description |
|--------|----------|-------------|
| `--symbol` | Yes | Market symbol (HIP-3 symbols keep their prefix and case, e.g. `xyz:SP500`), or the first argument |
| `--exchange` | Yes | `hyperliquid` or `hip3` |
| `--start` | No | Start time (ISO 8601 or Unix ms). Without it, the response is the newest buckets of the 24 hours before `--end`, with no cursor. |
| `--end` | No | End time (ISO 8601 or Unix ms); defaults to now |
| `--interval` | No | `1m`, `5m`, `15m`, `30m`, `1h` (default), `4h`, `1d`, `1w` |
| `--limit` | No | Buckets per page, 1 to 10,000 (default 500) |
| `--cursor` | No | Pagination cursor (`nextCursor` from the previous response) |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

While `has_more` is true, run the command again with `--cursor <nextCursor>` and the same `--start`, `--end`, and `--interval`. Below `1h` a page can hold fewer than `--limit` buckets and still have more after it, so stop on `has_more`, not on a short page. `cumulativeDelta` restarts on every page: rebuild it from `delta` when joining pages. A response that is one page of several says so in `meta.notice`.

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

HIP-4 per-side open interest is available from 2026-05-02 16:51 UTC at approximately 10-second cadence. Lighter open interest is also approximately 10 seconds; cadence is data-type specific rather than a generic venue-wide promise.

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

### `oxa instruments list` (also `oxa instruments`)

List all available instruments on a venue. `--exchange spot` lists the Spot pairs, as `oxa spot pairs` does.

```bash
oxa instruments list --exchange <exchange> [--format <format>]
```

### `oxa symbols list` (also `oxa symbols`)

List the public symbol universe across every venue: each entry's venue family (`exchange`: `hyperliquid`, `hip3`, `hip4`, `spot`, `lighter`, or `rh-lighter`), coverage start and end, data types, the earliest coverage per data type (`coverageByType`), and the estimated size per day per data type (`sizePerDay`). HIP-4 entries also carry the slug, outcome pair, display title, and settlement state. The API returns the whole list in one response (every HIP-4 outcome side is an entry, so the full list runs to several megabytes); `--exchange` and `--symbol` filter it locally.

```bash
oxa symbols list --exchange hyperliquid --symbol BTC
oxa symbols list --exchange hip4 --out hip4-symbols.json
oxa symbols list | jq '[.[] | select(.exchange == "spot")] | length'
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | No | Keep one venue family: `hyperliquid`, `hip3`, `hip4`, `spot`, `lighter`, or `rh-lighter` |
| `--symbol` | No | Keep one symbol, matched exactly (`xyz:SP500`, `HYPE-USDC`); a bare HIP-4 number such as `82260` also matches `#82260` |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

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

### `oxa liquidations levels` and `oxa liquidations levels-history`

Projected forced-liquidation levels on Hyperliquid and HIP-3: the long and short notional (and position counts) that would be liquidated in each price bucket around the mark price, computed from clearinghouse positions and margin state. Snapshots refresh about every five minutes and are kept from 2026-07-27. Each snapshot also carries the total long and short notional at risk and `flaggedNotional`, exposure computed approximately or not bucketed (HIP-3 cross-margin positions). These are projected forced liquidations, not pending trigger orders; see `oxa orders trigger-levels` for those.

```bash
oxa liquidations levels --exchange hyperliquid --symbol BTC --range-pct 5 --buckets 50
oxa liquidations levels --exchange hip3 --symbol xyz:TSLA --at $HOUR_AGO
oxa liquidations levels-history --exchange hyperliquid --symbol BTC \
  --start $DAY_AGO --end $NOW --summary
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid` or `hip3` |
| `--symbol` | Yes | Market symbol |
| `--range-pct` | No | Percentage range around the mark price, 1 to 50 (default 10) |
| `--buckets` | No | Number of price buckets, 10 to 200 (default 50) |
| `--side` | No | Keep one side: `bid`, `buy`, or `B` (longs); `ask`, `sell`, or `A` (shorts). The other side reads zero. |
| `--at` | No (`levels`) | Point-in-time read (ISO 8601 or Unix ms): the newest snapshot at or before it |
| `--start` | No (`levels-history`) | Start time; defaults to 24 hours before `--end` |
| `--end` | No (`levels-history`) | End time; defaults to now |
| `--summary` | No (`levels-history`) | List snapshots without their price buckets |
| `--limit` | No (`levels-history`) | Snapshots per page, 1 to 100 (default 24) |
| `--cursor` | No (`levels-history`) | Pagination cursor from the previous response |
| `--out` | No (`levels-history`) | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa summary get` (also `oxa summary`)

Get a combined market summary in one call: mark price, oracle price, open interest, 24h volume, and any available funding or liquidation fields.

```bash
oxa summary get --exchange <exchange> --symbol <symbol> [--format <format>]
```

### `oxa prices history` (also `oxa prices`)

Get mark/oracle/mid price history over a time range.

```bash
oxa prices history --exchange <exchange> --symbol <symbol> --start <time> --end <time> [options]
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

### `oxa freshness get` (also `oxa freshness`)

Check data freshness across all data types for a symbol, on every venue including `--exchange spot`.

```bash
oxa freshness get --exchange <exchange> --symbol <symbol> [--format <format>]
```

### `oxa data-quality ...`

Platform status, coverage, incidents, latency, and SLA compliance, and the freshness of the account positions data.

```bash
oxa data-quality status --format pretty
oxa data-quality coverage
oxa data-quality coverage --exchange hip3
oxa data-quality coverage --exchange hyperliquid --symbol BTC --from $WEEK_AGO --to $NOW
oxa data-quality incidents --status resolved --exchange lighter --limit 20
oxa data-quality incident <incident_id>
oxa data-quality latency --format pretty
oxa data-quality sla --year 2026 --month 8
oxa data-quality positions-freshness --format pretty
```

| Subcommand | Description |
|---|---|
| `oxa data-quality status` | Overall status (`operational`, `degraded`, `outage`, or `maintenance`), each venue's status, last data time, and latency, each data type's 24-hour completeness, and the number of active incidents. |
| `oxa data-quality coverage` | Earliest and latest data, record counts, symbol counts, and completeness per data type for every venue. `--exchange` narrows it to one venue (`hyperliquid`, `hip3`, `hip4`, `spot`, `lighter`, or `rh-lighter`). With `--exchange` and `--symbol`, one symbol's coverage per data type with its gaps, cadence (median and p95 interval), and hour-level historical coverage; `--from` and `--to` bound the gap search (default the last 30 days). Symbols are named as the venue names them: `BTC`, `xyz:SP500`, `HYPE-USDC`, `#82260`. |
| `oxa data-quality incidents` | Data incidents, newest first. Filters: `--status` (`open`, `investigating`, `identified`, `monitoring`, `resolved`), `--exchange`, and `--since`. Page with `--limit` (1 to 100, default 20) and `--offset` against `pagination.total`. |
| `oxa data-quality incident <incident_id>` | One incident with its affected data types and symbols, duration, root cause, resolution, and records affected and recovered. |
| `oxa data-quality latency` | Current WebSocket and REST latency per venue, with the lag of order book, fills, funding, and open interest data. |
| `oxa data-quality sla` | SLA targets against actual uptime, data completeness, and p99 API latency for one month, with incidents and downtime. `--year` and `--month` pick the month (default the current one). |
| `oxa data-quality positions-freshness` | One row per positions venue (Hyperliquid, HIP-3, and both Lighter deployments): the latest live snapshot and its age and quality, whether it is stale, the latest hourly snapshot, and `builtThrough` and `finalizedThrough`. |

### `oxa positions ...` (account positions)

Open positions, their history, and every change to them, on Hyperliquid, HIP-3, and both Lighter deployments. Hyperliquid and HIP-3 positions are keyed by wallet address (`--address 0x...`); Lighter positions are keyed by integer account index (`--account <index>`). Positions cover perpetual markets; spot and HIP-4 markets have none.

```bash
# Current positions (and account summary) of a wallet or account
oxa positions get --exchange hyperliquid --address 0xYourWallet
oxa positions get --exchange hip3 --address 0xYourWallet --dex xyz
oxa positions get --exchange lighter --account 281474976710654
oxa positions get --exchange rh-lighter --account 42

# Positions as of a past time: state after every event before it
oxa positions get --exchange hyperliquid --address 0xYourWallet --timestamp $HOUR_AGO

# Hourly snapshots and the change log over a range
oxa positions history --exchange lighter --account 42 --start $DAY_AGO --end $NOW
oxa positions changes --exchange hyperliquid --address 0xYourWallet --start $DAY_AGO --end $NOW --symbol BTC

# Every open position in one market, largest first, with totals on the first page
oxa positions market --exchange hyperliquid --symbol BTC --side long --min-value 1000000
oxa positions market --exchange lighter --symbol ETH --hour $LAST_HOUR

# Long/short positioning summary: now, or an hourly series
oxa positions summary --exchange hip3 --symbol xyz:TSLA
oxa positions summary --exchange hyperliquid --symbol BTC --start $DAY_AGO --end $NOW

# Every open position across all markets at one hour (bulk, paginated)
oxa positions all --exchange rh-lighter --hour $LAST_HOUR --limit 2000 --out positions.json

# Account summaries (Hyperliquid and HIP-3)
oxa positions account --exchange hyperliquid --address 0xYourWallet
oxa positions account-history --exchange hyperliquid --address 0xYourWallet --start $DAY_AGO --end $NOW
```

| Subcommand | Venues | Description |
|---|---|---|
| `oxa positions get` | all four | Open positions at the latest snapshot or as of `--timestamp`, plus the account summary on the first page of a snapshot read: on Hyperliquid always, on HIP-3 with `--dex` (or a dex-prefixed `--symbol`), and on Lighter the account's position totals when no `--symbol` is set. Filters: `--symbol`, `--dex` (HIP-3). |
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

- The JSON output is `{ "data": ..., "nextCursor": ..., "has_more": ..., "meta": ... }`. `meta` states what the page describes: `asOf`, `snapshotTs`, `source` (`snapshot` for hourly and live snapshots, `reconstructed` for an as-of time between snapshots, `changes` for the change log), `quality`, `stale`, `builtThrough`, `finalizedThrough`, `requestedEnd` / `clampedTo` when a read was clamped, `totals` (market listings, first page only), and `notice` / `coverageFrom` when a request reaches before coverage. Before coverage, `--timestamp` reads and `--start`/`--end` ranges still succeed with an empty list; `get`, `changes`, and Lighter `history` add the notice. An `--hour` with no committed snapshot, including any hour before coverage, is an API error on `market` and `all` (`error_code` `not_found`, exit code 2).
- `--timestamp` on `oxa positions get` returns the committed snapshot when it names a snapshot hour, and otherwise a reconstruction: size, entry, and open time are exact, mark fields are taken at that time, and snapshot-only fields are null. A `--timestamp`, or a change-log `--end`, later than `meta.builtThrough` is clamped to it (`meta.requestedEnd`, `meta.clampedTo`).
- Every row carries its own `quality` (`complete`, `partial`, or `degraded`; Lighter rows can also read `preliminary`, `unreconciled`, or `incomplete`), and `meta.quality` is the snapshot's. A `partial` row is missing some fields, such as the mark, the entry, or the leverage, which read null or `unknown`. `meta.stale` is `true`, with a notice, when the latest snapshot is more than 12 minutes old.
- Hyperliquid and HIP-3 snapshots normally read `complete`; hourly snapshots before 2026-09-26 19:00 UTC can read `degraded` on every row.
- On both Lighter deployments, a snapshot of the most recent, not yet reconciled day can read `degraded` in `meta.quality` while its rows read `preliminary`. Those rows read `complete` once the venue's daily reconcile has covered them, which `meta.finalizedThrough` tracks.
- `data.accountSeen` on `oxa positions get` is `flat`, `never_seen`, or `outside_coverage`. `never_seen` means no recorded activity in the covered history, not proof that the account never traded.
- `meta.finalizedThrough` means what it means on Lighter trades: nothing before it will be re-derived. Rows after it can still change.
- Lighter settlement, insurance, and other system accounts are left out of `oxa positions market` and `oxa positions all` unless you pass `--include-system`, and are labelled by `accountKind` everywhere.
- Market and bulk listings are pinned to one snapshot through the cursor. If that snapshot is replaced while you page, the API answers `409` with `snapshot_advanced`; start again without `--cursor`.
- Page sizes: wallet and account routes default to 500 rows (maximum 5,000); market listings default to 100 (maximum 2,000); summary series return at most 168 hours per page; `oxa positions all` returns at most 2,000 rows per page.
- Billing matches trades: one credit per 1,000 rows returned, with a minimum of one credit per request. Account summaries and the Lighter L1 lookup cost one credit per request.

### `oxa lighter accounts by-l1` (Lighter mainnet; also `oxa accounts by-l1`)

List the Lighter account indices owned by an L1 (Ethereum) address, with the total count. Use the indices with `oxa positions ... --exchange lighter --account <index>`. The lookup is available for Lighter mainnet only.

```bash
oxa lighter accounts by-l1 --l1-address 0xYourL1Address [--limit <n>] [--cursor <cursor>] [--format <format>]
```

### `oxa wallets classify`

Precomputed daily behavioral metrics for active wallets on Hyperliquid or HIP-3: order and fill counts, cancel, fill, and maker ratios, order sizes, volume, fees, realized PnL, liquidation count, and TWAP, client order id, builder, and priority-gas usage. Each response covers one daily snapshot (`date`, yesterday by default) with the number of matching wallets (`total`); page with `--offset` and `--limit`. The JSON output is the response as returned: `{ "wallets": [...], "total": ..., "date": ... }`, each wallet with its `address`, `metrics`, and `period`.

```bash
oxa wallets classify --exchange hyperliquid --sort total_volume_usd --min-orders 1000 --max-cancel-rate 0.5 --limit 100
oxa wallets classify --exchange hip3 --uses-twap true
oxa wallets classify --exchange hyperliquid --limit 100 --offset 100
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid` or `hip3` |
| `--min-orders` | No | Minimum order count (default 100) |
| `--min-volume-usd` | No | Minimum fill volume in USD (default 0) |
| `--sort` | No | Metric to sort by (default `total_orders`): `total_orders`, `total_fills`, `total_volume`, `total_volume_usd`, `cancel_rate`, `fill_rate`, `maker_ratio`, `avg_order_size_usd`, `avg_order_notional`, `max_order_size_usd`, `max_order_notional`, `active_hours`, `unique_coins`, `total_fees`, `total_fees_usd`, `realized_pnl`, `realized_pnl_usd`, `median_cancel_speed_ms`, `twap_fills`, `total_priority_gas`, `total_priority_gas_paid`, `total_builder_fees`, `total_builder_fees_paid` |
| `--order` | No | `asc` or `desc` (default) |
| `--uses-twap` | No | `true` or `false`: only wallets that do, or do not, use TWAP orders |
| `--uses-priority-gas` | No | `true` or `false`: only wallets that do, or do not, pay priority gas |
| `--min-cancel-rate` | No | Minimum cancel rate, 0 to 1 |
| `--max-cancel-rate` | No | Maximum cancel rate, 0 to 1 |
| `--date` | No | Snapshot date in UTC, `YYYY-MM-DD` (defaults to yesterday) |
| `--limit` | No | Wallets per page, 1 to 1,000 (default 100) |
| `--offset` | No | Page offset, 0 to 100,000 (default 0) |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

### `oxa outcomes list` (HIP-4 only)

List HIP-4 outcome markets (binary outcome metadata). The same commands sit under the venue as `oxa hip4 outcomes list`, `oxa hip4 outcomes get`, and `oxa hip4 outcomes by-slug`.

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
| `outcome_id` | Yes | Numeric outcome id (e.g. `8226`; `oxa hip4 outcomes list` lists them) |
| `--format` | No | `json` (default) or `pretty` |

### `oxa outcomes by-slug` (HIP-4 only)

Get a HIP-4 outcome market by slug: the outcome's own slug (`btc-above-78213-may-03-0600`) or either side's (`btc-above-78213-yes-may-03-0600`). The response is the outcome aggregate, as with `oxa outcomes get`: it includes `aggregatedOi`, and `sideSpecs` lists each side's coin and slug. Also available as `oxa hip4 outcomes by-slug`. Quote a slug that contains spaces.

```bash
oxa outcomes by-slug <slug> [--format <format>]
```

### `oxa orders history`

Get order history with user attribution. The `oxa orders`, `oxa l4`, and `oxa l2` commands cover Hyperliquid routes (`hyperliquid`, `hip3`, and `hip4` where noted, and `spot` on `oxa orders history` and `oxa l4`); `--exchange lighter` and `--exchange rh-lighter` are rejected before any request.

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
| `--triggered` | No | `true` keeps only trigger events; `false` leaves them out |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

The filters apply on Hyperliquid, HIP-3, and HIP-4. Spot order history (`--exchange spot`, or `oxa spot orders <symbol>`) takes the time range and cursor only, and refuses the filters before any request.

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
| `--limit` | No | Buckets per page (default 1000, max 10000) |
| `--cursor` | No | Pagination cursor (`nextCursor` from the previous response) |
| `--out` | No | Write JSON output to file |
| `--format` | No | `json` (default) or `pretty` |

A page holds the oldest `--limit` buckets of the window. While the response carries `nextCursor` (and `has_more` is true), run the command again with `--cursor <nextCursor>` and the same `--start`, `--end`, and `--interval`; stop when it is `null`. Buckets are labelled by their open time in UTC, and buckets with no events are omitted.

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

### `oxa orders trigger-levels` and `oxa orders trigger-levels-history`

The pending trigger-order map on Hyperliquid and HIP-3: currently open stop-loss and take-profit trigger orders grouped into price buckets near the mid price, with the order count and size on each side of every bucket. `asOf` is the time the pending state was read. History is kept at a 15-minute cadence from 2026-07-27. These are voluntary trigger orders, not projected forced liquidations; see `oxa liquidations levels` for those. HIP-4 and Spot have no trigger levels.

```bash
oxa orders trigger-levels --exchange hyperliquid --symbol BTC --range-pct 5
oxa orders trigger-levels-history --exchange hip3 --symbol xyz:TSLA \
  --start $DAY_AGO --end $NOW --limit 100
```

The options are those of `oxa liquidations levels` and `levels-history` above, except `--at`: `--exchange`, `--symbol`, `--range-pct`, `--buckets`, and `--side` on both, and `--start`, `--end`, `--summary`, `--limit`, `--cursor`, and `--out` on the history.

### `oxa l4 get`

Get an L4 order-level orderbook reconstruction at a point in time, on `hyperliquid`, `hip3`, `hip4`, or `spot`.

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

Get L2 all-level orderbook history over a time range on supported Hyperliquid routes. Every checkpoint carries the full book unless `--depth` caps the price levels per side.

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

### `oxa lighter l3 get` (also `oxa l3 get`)

Get a Lighter L3 order-level orderbook snapshot (maximum 250 orders per side). Lighter mainnet only; Lighter on Robinhood Chain has no L3. L3 is a Lighter-only datatype, so it sits under `oxa lighter`; `oxa l3 get` is the same command.

```bash
oxa lighter l3 get --symbol <symbol> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--symbol` | Yes | Trading symbol (e.g. BTC, ETH) |
| `--timestamp` | No | Historical snapshot time (ISO 8601 or Unix ms); latest when omitted |
| `--depth` | No | Maximum orders per side (Lighter cap: 250) |
| `--account` | No | Only the orders owned by this Lighter account index |
| `--format` | No | `json` (default) or `pretty` |

**Note:** L3 commands are Lighter-only and do not accept an `--exchange` flag.

### `oxa hip4 ...` (HIP-4 outcome markets)

Explicit HIP-4 command surface. Each outcome trades as two side coins, written as bare numerics: 10 times the outcome id plus the side (`82260` is outcome 8226, Yes). Outcomes settle and new ones are listed every day, so look up a current coin first (see [First Request](#first-request), which sets `COIN`); a settled outcome no longer has a live book. HIP-4 trades and candles are served from 2026-05-02 08:00 UTC, and the order book, per-side OI (about every 10 seconds), and prices from 2026-05-02 16:51 UTC. HIP-4 has no funding or liquidations. Outcomes and questions are HIP-4 only and live here. The market-data commands below are the same as `--exchange hip4` on the shared datatypes (`oxa orderbook get --exchange hip4 --symbol "$COIN"`, `oxa trades history --exchange hip4 --symbol "$COIN"`), which is the one grammar every venue shares.

```bash
# Discovery
oxa hip4 instruments
oxa hip4 outcomes list --settled false
oxa hip4 outcomes get $(( COIN / 10 ))
oxa hip4 outcomes by-slug btc-above-78213-may-03-0600   # a settled outcome, looked up by its slug

# Questions: binary outcomes grouped under one ballot
oxa hip4 questions list --limit 100
oxa hip4 questions get 1

# Market data
oxa hip4 orderbook get "$COIN" --depth 10
oxa hip4 orderbook history "$COIN" --start $HOUR_AGO --end $NOW
oxa hip4 trades "$COIN" --recent --limit 50
oxa hip4 trades "$COIN" --start $HOUR_AGO --end $NOW --side buy
oxa hip4 candles "$COIN" --start $HOUR_AGO --end $NOW --interval 5m
oxa hip4 oi current "$COIN"
oxa hip4 oi history "$COIN" --start $HOUR_AGO --end $NOW --interval 5m
oxa hip4 prices "$COIN" --start $HOUR_AGO --end $NOW --interval 5m
oxa hip4 summary "$COIN"
oxa hip4 freshness "$COIN"

# Order-level
oxa hip4 orders history "$COIN" --start $HOUR_AGO --end $NOW --triggered true
oxa hip4 orders flow    "$COIN" --start $HOUR_AGO --end $NOW --interval 5m
oxa hip4 orders tpsl    "$COIN" --start $HOUR_AGO --end $NOW
oxa hip4 l4 get      "$COIN"
oxa hip4 l4 diffs    "$COIN" --start $HOUR_AGO --end $NOW
oxa hip4 l4 history  "$COIN" --start $HOUR_AGO --end $NOW
```

A question groups binary outcomes under one ballot: one named outcome per choice (`namedOutcomeIds`) plus a fallback outcome (`fallbackOutcomeId`) that resolves Yes when no named choice does. `settledNamedOutcomes` lists the named outcomes that have settled, and outcome ids match `oxa hip4 outcomes`. `oxa hip4 questions list` pages with `--limit` (1 to 1,000, default 100) and `--cursor`.

### `oxa hip3 oracle ...` (HIP-3 oracle)

Oracle reads for a HIP-3 builder market. Symbols keep their builder prefix and case (`xyz:SP500`).

```bash
oxa hip3 oracle external-price xyz:SP500
oxa hip3 oracle discovery-bounds xyz:SP500 --format pretty
```

| Subcommand | Description |
|---|---|
| `oxa hip3 oracle external-price <symbol>` | The latest deployer-pushed external reference price (`externalPrice`) with the mark price (`markPrice`); either can be `null` when not available. |
| `oxa hip3 oracle discovery-bounds <symbol>` | The instantaneous discovery bounds (`lowerBound`, `upperBound`) around the reference price: the external price when available, otherwise the mark price, named in `referenceSource`. Also `maxLeverage` and the fraction applied on each side (`boundFraction`). The full ratcheted range can be wider when deployer-specific reset configuration applies. |

Both carry the source `blockNumber`, and `timestamp` as an RFC 3339 string with the same instant in Unix ms as `timestampMs`.

### `oxa spot ...` (Hyperliquid Spot)

Explicit Spot command surface. Symbols are dashed canonical (`HYPE-USDC`, `PURR-USDC`); the server resolves the dashed form to Hyperliquid's wire formats (`PURR/USDC`, `@107`) internally. Spot has no funding, open interest, or liquidations; candles are served through the dedicated Spot route. Pairs and TWAP statuses are Spot only and live here. The Spot market data is also served by the shared datatypes with `--exchange spot`: `oxa orderbook get|history`, `oxa trades history`, `oxa candles history`, `oxa l4 get|diffs|history`, `oxa orders history`, `oxa freshness get`, and `oxa instruments list`.

Coverage (`oxa capabilities --exchange spot`): candles from 2025-03-22 10:50 UTC, with `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, and `1w` intervals and a maximum limit of 1000; trades from 2025-03-22 10:50:22 UTC; TWAP statuses from 2026-05-05 13:05 UTC; order book from 2026-05-05 19:56 UTC; L4 diffs and checkpoints from 2026-05-05 22:57 UTC (PURR-USDC from 2026-03-11 01:03 UTC), with order history reaching back further. `oxa spot pairs` lists the current pairs. Every Spot route is available on every plan, including Free; on Free, history is limited to the most recent rolling 30 days (see [Plans and Data Access](#plans-and-data-access)).

```bash
# Discovery
oxa spot pairs
oxa spot pairs get HYPE-USDC

# Market data
oxa spot orderbook HYPE-USDC --depth 10
oxa orderbook history --exchange spot --symbol HYPE-USDC --start $HOUR_AGO --end $NOW --depth 10
oxa spot trades HYPE-USDC --start $HOUR_AGO --end $NOW --side sell
oxa spot candles HYPE-USDC --start $HOUR_AGO --end $NOW --interval 1m --limit 1000

# L4 / order lifecycle
oxa spot l4 HYPE-USDC
oxa spot l4-diffs HYPE-USDC --start $HOUR_AGO --end $(( HOUR_AGO + 300000 ))
oxa spot l4-history HYPE-USDC --start $DAY_AGO --end $NOW
oxa spot orders HYPE-USDC --start $HOUR_AGO --end $NOW

# TWAP statuses (REST only; there is no live TWAP stream)
oxa spot twap history HYPE-USDC --start $DAY_AGO --end $NOW
oxa spot twap-user 0xYourWallet --start $DAY_AGO --end $NOW

# Per-symbol freshness across orderbook, trades, L4, TWAP
oxa spot freshness HYPE-USDC
```

| Subcommand | Description |
|---|---|
| `oxa spot pairs` | List the active spot pairs; also `oxa spot pairs list` |
| `oxa spot pairs get <symbol>` | Get a single spot pair; also `oxa spot pair <symbol>` |
| `oxa spot candles <symbol>` | Spot OHLCV candles from 2025-03-22 10:50 UTC; intervals `1m` through `1w`, max 1000 rows |
| `oxa spot orderbook <symbol>` | Current spot L2 orderbook (history from 2026-05-05 19:56 UTC) |
| `oxa spot trades <symbol>` | Spot trade history (from 2025-03-22 10:50:22 UTC). Requires `--start`/`--end`; `--side buy` or `--side sell` keeps one taker side. Without a range, `oxa trades history --exchange spot` returns the most recent trades. |
| `oxa spot l4 <symbol>` | Spot L4 orderbook reconstruction |
| `oxa spot l4-diffs <symbol>` | Spot L4 orderbook diffs over `--start` / `--end`, cursor paged (`--limit`, `--cursor`, `--out`) |
| `oxa spot l4-history <symbol>` | Spot L4 orderbook checkpoints over `--start` / `--end`, cursor paged (`--limit`, `--cursor`, `--out`) |
| `oxa spot orders <symbol>` | Spot order lifecycle history with user attribution. Takes the time range and cursor only; Spot order history has no user, status, or order-type filters. |
| `oxa spot twap history <symbol>` | TWAP statuses for a single pair; also `oxa spot twap <symbol>`. TWAP statuses are served over REST only. |
| `oxa spot twap-user <user>` | TWAP statuses for a single user wallet across pairs |
| `oxa spot freshness <symbol>` | Per-symbol freshness across orderbook, trades, L4, TWAP |

For realtime spot streams, use `oxa stream subscribe <channel> <symbol>` with one of `spot_orderbook`, `spot_trades`, `spot_l4_diffs`, `spot_l4_orders`. Spot trades and books are also available through `oxa stream trades` and `oxa stream orderbook` with `--exchange spot`. The `spot_twap` channel does not stream; read TWAP statuses with `oxa spot twap history`. Example:

```bash
oxa stream subscribe spot_trades HYPE-USDC --duration-ms 60000
oxa stream trades HYPE-USDC --exchange spot --duration-ms 60000
```

### `oxa stream ...` (realtime WebSocket)

Stream live market data over a single WebSocket subscription, or replay stored data with `oxa stream replay` (see [Replay](#replay)). Output is NDJSON on stdout (one JSON record per line) by default; `--format pretty` adds a one-line summary per event. WebSocket streaming is available on every plan, including Free. Connection counts, subscription caps, and replay speed scale with plan; on Free, replay is limited to the most recent rolling 30 days with a maximum 30-day span per replay (see [Plans and Data Access](#plans-and-data-access)). Each `oxa stream` process opens one WebSocket connection, which counts toward your plan's connection limit; the default endpoint is `wss://api.0xarchive.io/ws`. Requires Node.js 22 or later, for the global `WebSocket`.

```bash
# Realtime liquidations (Hyperliquid; pass `--exchange hip3` for HIP-3 builder perps)
oxa stream liquidations BTC
oxa stream liquidations xyz:SP500 --exchange hip3

# Realtime trades (channel data is the same fill row used by historical /trades, with `is_liquidation: true` on liquidation fills)
oxa stream trades BTC
oxa stream trades xyz:SP500 --exchange hip3

# Realtime orderbook
oxa stream orderbook BTC --duration-ms 60000
oxa stream orderbook HYPE-USDC --exchange spot --duration-ms 60000

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

# Full-depth L2 books: every price level, then level changes
oxa stream subscribe orderbook_full BTC
oxa stream subscribe hip3_orderbook_full xyz:SP500

# HIP-4 outcome markets (bare numeric side coins; COIN is set in First Request)
oxa stream subscribe hip4_trades "$COIN"
oxa stream subscribe hip4_l4_diffs "$COIN"

# Replay ten minutes of stored trades at 10x real time (one minute), then exit
oxa stream replay trades BTC --start $HOUR_AGO --end $(( HOUR_AGO + 600000 )) --speed 10

# Replay five minutes of HIP-3 L4 diffs in bulk
oxa stream replay hip3_l4_diffs xyz:TSLA --start $HOUR_AGO --end $(( HOUR_AGO + 300000 ))
```

| Option | Applies to | Description |
|--------|------------|-------------|
| `--exchange` | `trades` | `hyperliquid` (default), `hip3`, `hip4`, `spot`, `lighter`, or `rh-lighter` |
| `--exchange` | `orderbook` | `hyperliquid` (default), `hip3`, `spot`, `lighter`, or `rh-lighter`. HIP-4 books replay only (`oxa stream replay hip4_orderbook <coin>`). |
| `--exchange` | `liquidations` | `hyperliquid` (default) or `hip3` |
| `--interval-ms` | `orderbook --exchange lighter` or `rh-lighter`, `subscribe lighter_orderbook` or `rh_lighter_orderbook` | Milliseconds between Lighter books, 100 to 5000. Default 1000. Rejected on every other channel. |
| `--duration-ms` | All | Close the stream after N milliseconds and exit with code 0 |
| `--url` | All | Override the WebSocket URL (or set `OXA_WS_URL`) |
| `--format` | All | `json` (NDJSON, default) or `pretty` |

`oxa stream subscribe` accepts every channel that `oxa capabilities` lists as live. The CLI reads that list from the SDK's channel table, which mirrors `/v1/capabilities`: `orderbook`, `trades`, `liquidations`, `open_interest`, `funding`, `ticker`, `all_tickers`, `l4_diffs`, `l4_orders`, `orderbook_full` (Hyperliquid); `hip3_orderbook`, `hip3_trades`, `hip3_open_interest`, `hip3_funding`, `hip3_liquidations`, `hip3_l4_diffs`, `hip3_l4_orders`, `hip3_orderbook_full` (HIP-3); `hip4_trades`, `hip4_l4_diffs`, `hip4_l4_orders` (HIP-4); `spot_orderbook`, `spot_trades`, `spot_l4_diffs`, `spot_l4_orders` (Spot); and the four live channels of each Lighter deployment. The replay-only channels (`candles`, `hip3_candles`, `hip4_orderbook`, `hip4_open_interest`, `lighter_candles`, `lighter_l3_orderbook`, `rh_lighter_candles`) are refused before a socket opens, with a pointer to the command that serves their data, and so is `spot_twap`, whose TWAP statuses are served over REST only (`oxa spot twap history`).

Each `liquidations` / `hip3_liquidations` event is delivered as a fill row with `is_liquidation: true`. To stop early, send SIGINT (Ctrl-C) or pass `--duration-ms`; both exit with code 0. An error message from the server is written to stderr with its `error_code`, and the CLI exits with the code for that class (see [Exit Codes](#exit-codes)): an unknown symbol (`invalid_symbol`) exits with code 2, and a connection that fell behind (`slow_consumer`) exits with code 4, so a supervising script can restart the stream. The one exception is a Lighter drop notice, which the CLI reports as a warning while the stream continues (see [Lighter live channels](#lighter-live-channels)). Every connection selects API version `2026-10-01` (`version=2026-10-01` on the URL).

#### Lighter live channels

Live subscriptions are available for four Lighter channels on each deployment:

| Lighter mainnet | Lighter on Robinhood Chain |
|---|---|
| `lighter_orderbook` | `rh_lighter_orderbook` |
| `lighter_trades` | `rh_lighter_trades` |
| `lighter_open_interest` | `rh_lighter_open_interest` |
| `lighter_funding` | `rh_lighter_funding` |

`lighter_candles`, `lighter_l3_orderbook`, and `rh_lighter_candles` support historical replay only; the CLI rejects them before opening a socket and points to `oxa candles history --exchange lighter|rh-lighter` and `oxa lighter l3 get` / `oxa lighter l3 history`. Robinhood Chain has no L3 channel.

Lighter live data, for both deployments, is served on `wss://api.0xarchive.io/ws`, the CLI default. It is available on every plan, and every live Lighter message is metered per message, the same as Hyperliquid live data. `stream.0xarchive.io` carries a subset of Hyperliquid live channels and no Lighter channels; a Lighter subscribe there returns an error pointing to `wss://api.0xarchive.io/ws`.

The `rh_lighter_*` channels send exactly the same message shapes as the matching `lighter_*` channels below, with Robinhood Chain symbols and USDG-quoted prices. Everything in this section applies to both deployments, including `--interval-ms` on the book channel and drop notices.

Symbols are the same as `oxa instruments --exchange lighter` (or `--exchange rh-lighter`). They are case-insensitive on subscribe and echoed uppercase. Messages use the same envelope as Hyperliquid live data. Example messages (the book is cut to one level per side here; the trade is one trade, two fills):

```json
{"type":"data","channel":"lighter_orderbook","coin":"BTC","symbol":"BTC","data":{"coin":"BTC","time":1790294171459,"levels":[[{"px":"84368.7","sz":"0.00020","n":1}],[{"px":"84368.8","sz":"0.05720","n":1}]]}}
{"type":"data","channel":"lighter_trades","coin":"BTC","symbol":"BTC","data":[{"coin":"BTC","side":"A","px":"84367.9","sz":"0.00003","time":1790294182211,"hash":"0000001dc8774b28000001a0d5d94943000000000000000000000000000000000000000000000000","tid":31944180930,"oid":562953419896990,"crossed":false,"dir":null,"fee":null,"fee_token":null,"closed_pnl":null,"start_position":"109.79011","users":["281474976623827"]},{"coin":"BTC","side":"B","px":"84367.9","sz":"0.00003","time":1790294182211,"hash":"0000001dc8774b28000001a0d5d94943000000000000000000000000000000000000000000000000","tid":31944180930,"oid":844421425107071,"crossed":true,"dir":null,"fee":null,"fee_token":null,"closed_pnl":null,"start_position":"0.03940","users":["713845"]}]}
{"type":"data","channel":"lighter_funding","coin":"BTC","symbol":"BTC","data":{"coin":"BTC","ctx":{"openInterest":"172706178.266310","funding":"0.000012","premium":"-0.000327","markPx":"84363.5","oraclePx":"84397.0","midPx":"84368.8","dayNtlVlm":"908611371.550746","dayBaseVlm":"10808.97087","prevDayPx":"84285.9","impactPxs":null}}}
```

- **`lighter_orderbook`**: every message is a full book of up to 20 levels per side, not a diff. `levels[0]` holds bids, best (highest) first, and `levels[1]` holds asks, best (lowest) first. `px` and `sz` are decimal strings exactly as Lighter publishes them, and `n` is always `1` because Lighter does not publish per-level order counts. `time` is Lighter's book update time in milliseconds. The server sends the newest book at most once per interval: once a second by default, or every `--interval-ms` (100 to 5000). Each book sent is one metered message. On subscribe, the current book is sent immediately when one is available; illiquid markets can go minutes without a change. A slow reader receives fewer books, never an older book in place of a newer one.
- **`lighter_trades`**: `data` is an array of fills with two fills per trade, one per side, sharing a `tid`. `side` is `A` (ask side) or `B` (bid side), `crossed: true` marks the taker leg, `users` holds the Lighter account index as a string, `oid` is that side's order id, `start_position` is that account's signed position before the trade, `hash` is the Lighter transaction hash, and `time` is in milliseconds. `fee`, `fee_token`, `closed_pnl`, and `dir` are always `null` in live messages because Lighter's live stream does not carry them. Count trades by distinct `tid`, not by array length, and compute volume from one leg per `tid`. Live trades are delivered as they happen and are preliminary. The finalized record, including fees, comes from `oxa trades history --exchange lighter --symbol BTC --start ... --end ...`, which returns reconciled trades only; without a range, `oxa trades history --exchange lighter --symbol BTC` returns the preliminary recent tier.
- **`lighter_open_interest`** and **`lighter_funding`** carry the same message, a `ctx` object of market stats, so one subscription is enough; subscribing to both delivers, and meters, every update twice. `openInterest` is Lighter's reported open interest, the same quantity `oxa oi current --exchange lighter --symbol BTC` returns. `funding` is Lighter's current funding rate as a fraction (Lighter publishes percent; the value is divided by 100), in the same units as `oxa funding current --exchange lighter --symbol BTC`, and `premium` is also a fraction. `markPx` is the mark price, `oraclePx` is Lighter's index price, `midPx` is the mid price, `dayNtlVlm` and `dayBaseVlm` are 24h quote and base volume, `prevDayPx` is derived from the last trade price and Lighter's 24h percent change, and `impactPxs` is always `null` (Lighter has no impact prices). Updates arrive as Lighter publishes them, about once per second per market, and the latest values are sent on subscribe when available.

If your connection falls behind `lighter_trades` or the stats channels, the server sends an error notice (for example `Dropped ~N live lighter_trades messages for BTC: your connection fell behind the Lighter stream, and those trades were not delivered.`) and keeps the subscription running. The CLI writes that notice to stderr as a warning line (`{"warning":"stream warning: Dropped ~N ...","type":"lag"}`, with the notice's `error_code` when it carries one) and keeps streaming; missed trades are not resent. If the lag persists, the server stops the subscription (`Stopped the lighter_trades stream for BTC: your connection is too slow to keep up. Re-subscribe to resume.`) and the CLI exits, as on any other server error.

WebSocket replay of all six Lighter mainnet channels, and of the five Robinhood Chain channels, delivers `historical_data` rows in the same shapes as the live messages above: a book in the live book shape, a trade as an array of one fill, and the `ctx` stats object. Start one with `oxa stream replay` (see [Replay](#replay)).

#### Full-depth books and HIP-4 channels

`orderbook_full` (Hyperliquid) and `hip3_orderbook_full` (HIP-3) stream the full-depth L2 book, every price level rather than the top levels. A subscription starts with one `l4_snapshot` message holding the whole aggregated book (`bids`, `asks`, `bid_count`, `ask_count`, `mid_price`, `spread`, `spread_bps`), followed by `l4_batch` messages whose `data` is an array of level changes. Both channels also replay in bulk (see [Replay](#replay)); REST full-depth history is `oxa l2 history` and `oxa l2 diffs`.

HIP-4 streams live on `hip4_trades`, `hip4_l4_diffs`, and `hip4_l4_orders`. `hip4_orderbook` and `hip4_open_interest` replay stored data but do not stream live, so `oxa stream subscribe` refuses them; read the current book and open interest with `oxa hip4 orderbook get` and `oxa hip4 oi current`. Pass HIP-4 coins as bare numerics (`82260`); the CLI sends them to the WebSocket API in its `#82260` form. `hip4_l4_diffs` starts with an L4 snapshot of the book.

#### Replay

`oxa stream replay <channel> <symbol> --start <time> --end <time>` replays stored data over one WebSocket connection through the SDK's replay client. Every server message (`replay_started`, the `historical_data` rows, `l4_snapshot` and `l4_batch` pages on the bulk channels, `gap_detected`, and `replay_completed`) is written to stdout as one JSON record per line, and the command exits with code 0 when the replay completes. A server error is written to stderr with its `error_code` and exits with the code for its class (see [Exit Codes](#exit-codes)). In pretty format, bulk pages are summarized (`l4_batch 5000 events`, `l4_snapshot block=... bids=... asks=...`) rather than printed.

```bash
oxa stream replay trades BTC --start $HOUR_AGO --end $(( HOUR_AGO + 600000 )) --speed 10
oxa stream replay hip3_candles xyz:SP500 --start $HOUR_AGO --end $(( HOUR_AGO + 600000 )) --interval 1m --speed 10
oxa stream replay l4_diffs BTC --start $HOUR_AGO --end $(( HOUR_AGO + 300000 ))
oxa stream replay spot_l4_orders HYPE-USDC --start $HOUR_AGO --end $(( HOUR_AGO + 300000 ))
oxa stream replay orderbook_full BTC --start $HOUR_AGO --end $(( HOUR_AGO + 300000 ))
oxa stream replay lighter_orderbook ETH --start $HOUR_AGO --end $(( HOUR_AGO + 600000 )) --speed 10
```

| Option | Required | Description |
|--------|----------|-------------|
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--speed` | No | Playback speed multiplier for timed channels (default 1, real time). Your plan sets the maximum. Bulk channels ignore it. |
| `--interval` | No | Candle channels only (`candles`, `hip3_candles`, `lighter_candles`, `rh_lighter_candles`): `1m` to `1w` |
| `--url` | No | Override the WebSocket URL (or set `OXA_WS_URL`) |
| `--format` | No | `json` (NDJSON, default) or `pretty` |

Replayable channels are the ones `oxa capabilities` lists with replay; the CLI reads them from the SDK's channel table, which mirrors `/v1/capabilities`. Timed channels keep their original timing, scaled by `--speed`: `orderbook`, `trades`, `candles`, `liquidations`, `open_interest`, `funding` (Hyperliquid); `hip3_orderbook`, `hip3_trades`, `hip3_candles`, `hip3_open_interest`, `hip3_funding`, `hip3_liquidations` (HIP-3); `hip4_orderbook`, `hip4_trades`, `hip4_open_interest` (HIP-4); the six `lighter_*` and five `rh_lighter_*` channels. Bulk channels replay as fast as they are read, with `--speed` ignored: every L4 channel on every venue (`l4_diffs`, `l4_orders`, `hip3_l4_diffs`, `hip3_l4_orders`, `hip4_l4_diffs`, `hip4_l4_orders`, `spot_l4_diffs`, `spot_l4_orders`) and the full-depth books (`orderbook_full`, `hip3_orderbook_full`). A bulk replay starts with an `l4_snapshot` from the nearest checkpoint at or before `--start` and sends `l4_batch` pages in block order until `--end`. The live-only channels (`ticker`, `all_tickers`, `spot_orderbook`, `spot_trades`) and the REST-only `spot_twap` are refused before a socket is opened, with a pointer to the REST commands that serve their history. On Free, replay covers the most recent rolling 30 days with a maximum 30-day span.

### `oxa webhooks ...`

Webhooks push events to a URL of yours instead of being polled: liquidations, fills and transfers on wallets you watch, oracle moves, settlements, export jobs finishing, and the rest of the catalog. Deliveries are signed, retried, and logged. Three objects make a working integration: an **endpoint** (your URL plus the signing secret deliveries are signed with), a **subscription** (one event type and configuration, delivered to one endpoint), and a **watched wallet** (an address in scope for address-scoped events such as `account.fill`).

```bash
# What can be subscribed to, and what the plan allows
oxa webhooks event-types --format pretty
oxa webhooks limits --format pretty

# Size a rule against real history before creating it (every plan, including Free)
oxa webhooks estimate --event-type market.liquidation \
  --config '{"venue":"hyperliquid","conditions":[{"metric":"notional_usd","op":">=","value":250000}]}' --lookback-days 7
oxa webhooks dry-run --event-type market.liquidation --config '{"venue":"hyperliquid"}' --lookback-s 86400

# Create an endpoint (the signing secret is shown once), subscribe, and send a test delivery
oxa webhooks endpoints create --url https://example.com/webhooks/0xarchive --description "trading desk"
oxa webhooks subscriptions create --endpoint <endpoint_id> --event-type market.liquidation \
  --filters '{"venue":"hyperliquid","conditions":[{"metric":"notional_usd","op":">=","value":250000}]}'
oxa webhooks endpoints test <endpoint_id>

# Watch a wallet for address-scoped events
oxa webhooks addresses add --address 0xYourWallet --label desk
oxa webhooks subscriptions create --endpoint <endpoint_id> --event-type account.fill --filters '{"min_notional_usd":25000}'

# Deliveries, repeat deliveries, pauses
oxa webhooks endpoints deliveries <endpoint_id> --limit 20
oxa webhooks redeliver <delivery_id>
oxa webhooks subscriptions resume-all
```

| Command | Description |
|---|---|
| `oxa webhooks event-types` | Every event type with the filters, parameters, metrics, and operators it accepts. This is the authority on what a configuration may say. |
| `oxa webhooks limits` | What the plan allows (endpoints, subscriptions, watched wallets, deliveries per day), what is in use, and how many subscriptions are paused. |
| `oxa webhooks endpoints list` | Your endpoints, oldest first. Secrets are never listed. |
| `oxa webhooks endpoints create --url <url> [--description <text>]` | Create an endpoint. The response carries its signing secret, shown only this once. |
| `oxa webhooks endpoints delete <endpoint_id>` | Delete an endpoint and every subscription that points at it. Asks for confirmation. |
| `oxa webhooks endpoints enable <endpoint_id>` | Put an endpoint back into service after it was switched off. Events missed while it was off are not replayed. |
| `oxa webhooks endpoints rotate-secret <endpoint_id>` | Issue a new signing secret, shown once. The previous one keeps verifying for 24 hours, and deliveries in that window carry both signatures. Asks for confirmation. |
| `oxa webhooks endpoints test <endpoint_id>` | Queue a signed `webhook.test` delivery. It counts against today's delivery budget. |
| `oxa webhooks endpoints deliveries <endpoint_id> [--limit <n>]` | The delivery log, newest first (1 to 200, default 50), with state, attempts, last status code, error, latency, and the payload as signed. |
| `oxa webhooks redeliver <delivery_id>` | Queue a past delivery again with the same event id. It counts against today's delivery budget. |
| `oxa webhooks subscriptions list` | Your subscriptions with their configuration and pause state. |
| `oxa webhooks subscriptions create --endpoint <id> --event-type <type> [--filters <json>]` | Create a subscription. The configuration is validated against the catalog; an unknown key or an out-of-range value is refused. |
| `oxa webhooks subscriptions update <subscription_id> [--filters <json>] [--enabled true\|false]` | Replace the configuration, switch the subscription on or off, or both. |
| `oxa webhooks subscriptions delete <subscription_id>` | Delete one subscription. Asks for confirmation. |
| `oxa webhooks subscriptions resume <subscription_id>` | Put a paused subscription back into service. The result carries the missed window (`gap.replayWindow`); nothing is buffered while paused. |
| `oxa webhooks subscriptions resume-all` | Resume every paused subscription in one call. |
| `oxa webhooks estimate --event-type <type> [--config <json>] [--lookback-days <n>]` | How often a rule would have fired over 1 to 30 days (default 7): a per-day series, the median and busiest day, and the daily rate at other thresholds. |
| `oxa webhooks dry-run --event-type <type> [--config <json>] [--lookback-s <n>] [--limit <n>]` | The occurrences a rule would have delivered over the last 60 to 86,400 seconds (default 3,600), newest first (1 to 200, default 100). |
| `oxa webhooks addresses list` | Your watched wallets and how many the plan allows. |
| `oxa webhooks addresses add --address <0x...> [--label <text>]` | Watch a wallet (label up to 64 characters). Adding one you already watch returns the existing entry. |
| `oxa webhooks addresses delete <address_id>` | Stop watching a wallet. Subscriptions that name it keep their stored filters. Asks for confirmation. |
| `oxa webhooks verify --signature <value> --secret <secret> [--body-file <path>]` | Verify a delivery's signature (see below). |

Configurations are wire-shaped JSON objects, passed to the API exactly as written: use `min_notional_usd`, `params.max_age_s`, and `conditions[].metric`, not camelCase spellings. Pass them inline (`--filters`, `--config`) or from a file (`--filters-file`, `--config-file`). The estimate and the dry run validate a configuration exactly as a create does, and share a budget of six calls a minute. Free has no webhook delivery (no endpoints, subscriptions, or watched wallets); the estimate and the dry run are available on every plan.

Deleting an endpoint, a subscription, or a watched wallet, and rotating a secret, ask for confirmation in an interactive terminal. Pass `--yes` to skip the prompt in scripts; without a terminal and without `--yes`, the command changes nothing and exits with code 2.

#### Verifying a delivery

`oxa webhooks verify` checks a delivery's `0xa-signature` header against the raw request body with the SDK's verifier, so you can confirm a receiver's secret and capture pipeline from a terminal. It needs no API key and never prints the secret.

```bash
# Body saved byte for byte from the request, header value copied from 0xa-signature
oxa webhooks verify --body-file delivery.json --signature 't=1758240000,v1=027f40e9...' --secret "$WEBHOOK_SECRET"

# Or pipe the body on stdin; during a rotation pass both secrets
cat delivery.json | oxa webhooks verify --signature "$SIG" --secret "$NEW_SECRET" --secret "$OLD_SECRET"

# A stored delivery is older than the replay window; skip that check deliberately
oxa webhooks verify --body-file delivery.json --signature "$SIG" --ignore-timestamp
```

| Option | Required | Description |
|--------|----------|-------------|
| `--signature` | Yes | The `0xa-signature` header value (`t=<seconds>,v1=<hex>`, with a second `v1` during a rotation). A pasted `0xa-signature:` prefix is ignored. |
| `--secret` | Yes, or `OXA_WEBHOOK_SECRET` | The endpoint's signing secret, the whole `whsec_...` string. Repeat it to accept either of two secrets. |
| `--body-file` | No | File holding the raw body; without it the body is read from stdin |
| `--tolerance` | No | Replay window in seconds around the signing time (default 300) |
| `--ignore-timestamp` | No | Skip the replay window, for a stored delivery or a test vector |
| `--format` | No | `json` (default) or `pretty` |

On success the command prints `{"valid": true, "eventId": ..., "eventType": ..., "signedAt": ..., "event": {...}}` and exits with code 0. A delivery that does not verify exits with code 2 and names the check that failed: `missing_signature_header`, `malformed_signature_header`, `timestamp_out_of_tolerance`, `no_matching_signature`, or `invalid_payload`. Verify the raw bytes: a body that was parsed and re-serialised, or saved with a trailing newline, does not match its signature.

### `oxa lighter l3 history` (also `oxa l3 history`)

Get historical Lighter L3 orderbook snapshots over a time range. Lighter only. Each snapshot holds up to 250 resting orders per side, so the command takes no `--depth`.

```bash
oxa lighter l3 history --symbol <symbol> --start <time> --end <time> [options]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--symbol` | Yes | Trading symbol (e.g. BTC, ETH) |
| `--start` | Yes | Start time (ISO 8601 or Unix ms) |
| `--end` | Yes | End time (ISO 8601 or Unix ms) |
| `--account` | No | Only the orders owned by this Lighter account index |
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

Errors always go to stderr as one line of structured JSON, never stdout, in every output format. `code` is the exit code and `type` its class. A failure the API answered adds what the API sent: the stable `error_code`, the `request_id` to quote to support, the HTTP `status`, and, when the API names them, the refused `param` and its `valid_values`:

```json
{"error":"The symbol 'NOPE' does not exist. Please see /v1/hyperliquid/instruments for available symbols.","code":2,"type":"validation","error_code":"invalid_symbol","request_id":"7f3c2a9e-1b4d-4c8e-9a61-2d5e8f0b3c17","status":400,"param":"symbol"}
```

Branch on `error_code`, not on the message text. WebSocket errors from `oxa stream` carry `error_code` the same way.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `2` | Validation error: bad arguments or an unknown command, or a request the API refused as invalid |
| `3` | Authentication or access error: a missing or invalid key, or a plan limit |
| `4` | Network or API error: the API could not be reached, or it failed or asked to retry later |
| `5` | Internal error |

API failures exit by their `error_code`:

| Exit code | `error_code` |
|------|---------|
| `2` | `invalid_parameter`, `invalid_symbol`, `invalid_interval`, `invalid_cursor`, `invalid_time_range`, `range_before_coverage`, `unsupported_for_venue`, `route_not_found`, `not_found` |
| `3` | `unauthorized`, `forbidden`, `insufficient_scope`, `account_disabled`, `oauth_not_permitted`, `historical_range_exceeded`, `historical_depth_exceeded`, `insufficient_credits`, `api_key_limit_reached`, `wallet_requires_plan`, `wallet_account_required`, `wallet_free_signup_retired` |
| `4` | `rate_limited`, `conflict`, `upstream_unavailable`, `internal_error`, `slow_consumer`, and any other code |

A failure without an `error_code` exits with `3` for HTTP 401 and 403, and `4` otherwise.

## Pagination

Commands that return paginated data include `has_more` and `nextCursor` in the JSON response. While `has_more` is `true`, pass `nextCursor` back with `--cursor`, and the same time range and filters, to fetch the next page. On the last page `has_more` is `false` and `nextCursor` is `null`; that page can be empty when the page before it was exactly full. `--out` summaries report both, and pretty output prints the cursor to pass back. Cursors are opaque strings: pass them back unchanged.

```bash
# First page
oxa trades history --exchange hyperliquid --symbol BTC \
  --start $DAY_AGO --end $NOW --limit 100

# Next page (use nextCursor from previous response)
oxa trades history --exchange hyperliquid --symbol BTC \
  --start $DAY_AGO --end $NOW --limit 100 \
  --cursor "eyJ0IjoxNzA..."

# Every page into one NDJSON file, until has_more is false
args=(trades history --exchange hyperliquid --symbol BTC --start $(( NOW - 600000 )) --end $NOW --limit 1000)
page=$(oxa "${args[@]}")
echo "$page" | jq -c '.data[]' > trades.ndjson
while [ "$(echo "$page" | jq -r .has_more)" = "true" ]; do
  page=$(oxa "${args[@]}" --cursor "$(echo "$page" | jq -r .nextCursor)")
  echo "$page" | jq -c '.data[]' >> trades.ndjson
done
```

## For AI Agents

The CLI is designed for Claude Code, ChatGPT Codex, CI, cron, notebook setup, and other coding-agent pipelines. For richer typed context inside the agent, pair the CLI with the [0xArchive skill](https://github.com/0xArchiveIO/0xarchive-skill), which installs into `.claude/skills/0xarchive` (Claude Code) or `.agents/skills/0xarchive` (ChatGPT Codex). If you manage skills through OpenClaw, `openclaw install 0xarchive` is the optional helper. With the skill loaded, an agent can run `oxa auth test` to verify access and then issue any market-data command below:

```bash
# Verify API access
oxa auth test 2>/dev/null && echo "ready"

# Get multi-signal snapshot
oxa summary get --exchange hyperliquid --symbol BTC | jq '{price: .markPrice, funding: .fundingRate, oi: .openInterest}'

# Scan all coins
oxa instruments list --exchange hyperliquid | jq '.[].name'

# Fetch candles for backtesting
oxa candles history --exchange hyperliquid --symbol ETH \
  --start $WEEK_AGO --end $NOW \
  --interval 4h --out candles.json

# Check funding across exchanges
oxa funding current --exchange hyperliquid --symbol BTC
oxa funding current --exchange lighter --symbol BTC

# Gate on data freshness before acting
oxa freshness get --exchange hyperliquid --symbol BTC | jq '.orderbook.lagMs < 5000'

# Branch on the stable error code of a failure
oxa trades history --exchange hyperliquid --symbol NOPE --start $HOUR_AGO --end $NOW \
  2> error.json || jq -r '.error_code' error.json

# Get L4 order-level book reconstruction
oxa l4 get --exchange hyperliquid --symbol BTC --format pretty

# Stream L4 diffs for microstructure analysis
oxa l4 diffs --exchange hyperliquid --symbol BTC \
  --start $HOUR_AGO --end $(( HOUR_AGO + 300000 )) --out l4_diffs.json

# Query order flow aggregation
oxa orders flow --exchange hyperliquid --symbol ETH \
  --start $DAY_AGO --end $NOW --interval 1h

# Get L2 full-depth orderbook
oxa l2 get --exchange hyperliquid --symbol BTC --format pretty

# Get Lighter L3 orderbook snapshot
oxa lighter l3 get --symbol BTC --format pretty

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
oxa lighter accounts by-l1 --l1-address 0xYourL1Address | jq '.data.accounts[].accountIndex'
oxa positions get --exchange lighter --account 42

# HIP-4 outcome markets (bare numeric side coins; COIN is set in First Request)
oxa hip4 outcomes list --settled false
oxa hip4 orderbook get "$COIN" --depth 10
oxa hip4 trades "$COIN" --recent --limit 50

# Breadth, CVD, and liquidation levels for a quick market read
oxa breadth current --exchange hyperliquid | jq '.valuePct'
oxa cvd history --exchange hyperliquid --symbol BTC --interval 1h --limit 24 | jq '[.data[].delta] | add'
oxa liquidations levels --exchange hyperliquid --symbol BTC --range-pct 5 | jq '{totalLong, totalShort}'

# Replay ten minutes of trades as NDJSON
oxa stream replay trades BTC --start $HOUR_AGO --end $(( HOUR_AGO + 600000 )) --speed 10 \
  | jq -c 'select(.type == "historical_data") | .data'

# Hyperliquid Spot (dashed canonical symbols)
oxa spot pairs | jq '.[].symbol' | head
oxa spot pairs get HYPE-USDC | jq '{symbol, baseTokenName, quoteTokenName}'
oxa spot orderbook HYPE-USDC --depth 5
oxa spot trades HYPE-USDC --start $HOUR_AGO --end $NOW --out hype_trades.json
```

## Data Catalog

For large-scale data exports (route-specific order books, fill-level trade history, and other retained datasets), use the [Data Catalog](https://www.0xarchive.io/data). It lets you choose markets, datasets, and date ranges, see a live quote, and export zstd-compressed Parquet. The CLI is best for point queries and moderate datasets; the Data Catalog is the file-export path.

## Links

- [API Docs](https://docs.0xarchive.io)
- [Python SDK](https://pypi.org/project/oxarchive/)
- [TypeScript SDK](https://npmjs.com/package/@0xarchive/sdk)
- [Rust SDK](https://crates.io/crates/oxarchive)
- [MCP Server](https://docs.0xarchive.io/mcp-server)
- [0xArchive Skill](https://github.com/0xArchiveIO/0xarchive-skill)
- [Examples](https://github.com/0xArchiveIO/examples)

## License

MIT
