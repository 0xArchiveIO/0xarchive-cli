# Changelog

## 1.10.0 - 2026-09-28

### Added

- Lighter on Robinhood Chain, the second Lighter deployment, as `--exchange rh-lighter` on every shared market-data command that Lighter mainnet supports: instruments, order book and order book history, trades (canonical range and preliminary recent tier), candles, funding, open interest, liquidations, prices, summary, freshness, and `auth test`. It is USDG-quoted with 84 markets (57 perp, 27 spot); perps are uppercase (`BTC`) and spot markets are dashed (`AAPL-USDG`). Trades and liquidations are served from 2026-06-26 20:10:26 UTC, the venue's first trade; order book, open interest, and funding from 2026-08-22 18:43 UTC; candles from 2026-06-26 once they are enabled for this deployment. It has no L3.
- Live Robinhood Chain streams: `oxa stream orderbook <symbol> --exchange rh-lighter` and `oxa stream trades <symbol> --exchange rh-lighter`, and `oxa stream subscribe` accepts `rh_lighter_orderbook`, `rh_lighter_trades`, `rh_lighter_open_interest`, and `rh_lighter_funding`. Messages have the same shapes as the `lighter_*` live channels, `--interval-ms` (100 to 5000) works on `rh_lighter_orderbook`, and drop notices on `rh_lighter_*` channels are warnings, as on Lighter mainnet. They are served on `wss://api.0xarchive.io/ws`, the CLI default. `rh_lighter_candles` is replay-only and is rejected before a socket opens.
- Account positions, `oxa positions ...`, on `hyperliquid`, `hip3`, `lighter`, and `rh-lighter`: `get` (latest snapshot, or as of `--timestamp`), `history` (hourly snapshots), `changes` (the change log), `market` (every open position in one market, with `--side`, `--min-value`, and `--include-system` on Lighter), `summary` (long/short positioning now or hourly), and `all` (every open position at one hour). Hyperliquid and HIP-3 add `account` and `account-history`. Hyperliquid and HIP-3 are keyed by `--address`; Lighter by `--account <index>`. JSON output includes the response `meta` (as-of time, snapshot, source, quality, staleness, and finalization fields).
- `oxa accounts by-l1 --l1-address 0x...` lists the Lighter mainnet account indices owned by an L1 address.
- `--cursor` on `oxa orders flow` and `oxa hip4 orders flow`. Order flow is paged: a page holds the oldest `--limit` buckets of the window, and `nextCursor` is set while more may follow. Run the command again with `--cursor <nextCursor>` and the same `--start`, `--end`, and `--interval` until it is `null`. With `--out`, the summary reports `has_more` and `nextCursor`, as `oxa orders history` does.
- `oxa breadth current` and `oxa breadth history` (`--exchange hyperliquid` or `hip3`): the share of eligible instruments above their current UTC-session VWAP, with the counts behind it. `valuePct` stays `null` when no instrument is eligible, in JSON and in pretty output. History begins 2026-08-24 on Hyperliquid and 2026-08-28 on HIP-3; `--interval` keeps the last snapshot in each bucket.
- `oxa cvd <symbol>` (`--exchange hyperliquid` or `hip3`): cumulative volume delta, taker buy and sell notional per bucket (`1m` to `1w`, default `1h`) with the delta and a running total, cursor paged. The running total restarts on every page, and `meta.notice` says so.
- `oxa liquidations levels` and `oxa liquidations levels-history` (Hyperliquid and HIP-3): projected forced-liquidation levels in price buckets around the mark price, current or at `--at`, with history from 2026-07-27. `oxa orders trigger-levels` and `oxa orders trigger-levels-history`: the pending stop-loss and take-profit trigger map, with history at a 15-minute cadence. `--range-pct`, `--buckets`, and `--side` on all four; `--summary` lists history snapshots without their buckets.
- `oxa hip3 oracle external-price <symbol>` and `oxa hip3 oracle discovery-bounds <symbol>`: the deployer-pushed external price with the mark price, and the instantaneous discovery bounds around the reference price.
- `oxa hip4 questions list` and `oxa hip4 questions get <question_id>`: HIP-4 questions, binary outcomes grouped under one ballot with a fallback outcome.
- `oxa wallets classify` (`--exchange hyperliquid` or `hip3`): precomputed daily behavioral metrics per wallet, with `--min-orders`, `--min-volume-usd`, `--sort`, `--order`, `--uses-twap`, `--uses-priority-gas`, `--min-cancel-rate`, `--max-cancel-rate`, `--date`, and `--limit` / `--offset` paging.
- `oxa symbols`: the public symbol universe across every venue, with coverage dates, data types, and coverage and estimated size per data type. `--exchange` and `--symbol` filter the list locally.
- `oxa webhooks ...`: the event catalog (`event-types`) and plan limits (`limits`); endpoints (`endpoints list|create|delete|enable|rotate-secret|test|deliveries`) and `redeliver`; subscriptions (`subscriptions list|create|update|delete|resume|resume-all`) with wire-shaped JSON filters inline or from a file; the `estimate` and `dry-run` previews; and watched wallets (`addresses list|add|delete`). Deleting and rotating ask for confirmation in a terminal, or take `--yes`.
- `oxa webhooks verify`: checks a delivery's `0xa-signature` against the raw body (`--body-file` or stdin) with the SDK verifier, accepting either of two secrets during a rotation and enforcing the 300-second replay window unless `--tolerance` or `--ignore-timestamp` says otherwise. It needs no API key and never prints the secret.
- `oxa stream replay <channel> <symbol> --start --end [--speed] [--interval]`: WebSocket replay through the SDK client, written as NDJSON until the replay completes. Live-only channels are refused before a socket opens, with the SDK's error where the SDK refuses them.
- `oxa stream subscribe` accepts `orderbook_full` and `hip3_orderbook_full` (the full-depth L2 book: an `l4_snapshot` with every level, then `l4_batch` level changes) and the live HIP-4 channels `hip4_trades`, `hip4_l4_diffs`, and `hip4_l4_orders`. HIP-4 coins are given as bare numerics and sent in the `#<n>` form the WebSocket API expects. `hip4_orderbook` and `hip4_open_interest`, served from stored data only, are refused before a socket opens with a pointer to `oxa stream replay`.
- `--account <index>` on `oxa l3 get` and `oxa l3 history`: only the orders owned by one Lighter account index. `--timestamp` on `oxa l3 get` reads a historical snapshot.
- `oxa data-quality ...`: `status`, `coverage` (every venue, one venue with `--exchange`, or one symbol with `--exchange` and `--symbol`, including gaps and cadence, with `--from` and `--to` bounding the gap search), `incidents` (filtered by `--status`, `--exchange`, and `--since`, offset paged), `incident <incident_id>`, `latency`, `sla` (`--year`, `--month`), and `positions-freshness`.
- `oxa spot l4-diffs <symbol>` and `oxa spot l4-history <symbol>`: Spot L4 orderbook diffs and checkpoints over a time range, cursor paged.
- `oxa hip4 outcomes by-slug <slug>` and `oxa outcomes by-slug <slug>`: a HIP-4 outcome market by its outcome or side slug.
- A package-contents check (`npm run check:pack`) and a CI workflow that runs the typecheck, tests, build, and that check.

### Changed

- `oxa liquidations history` and `oxa liquidations volume` accept `--exchange lighter` and `--exchange rh-lighter`; they were previously refused. Lighter rows keep the trade's raw fields (`liquidationType`, `usdAmount`, both accounts, `rawJson`); Robinhood Chain rows from before live capture (2026-08-22) were backfilled from the venue's finalized export and carry `source` `bucket` with an empty `rawJson`. Lighter volume buckets carry a total and a count with no long/short split. `oxa liquidations user` stays Hyperliquid only.
- On Lighter ranges (both deployments), `oxa trades fetch` passes the response `meta` through, including the finalization fields (`meta.finalizedThrough`, and `meta.clampedTo` when the range was clamped to the watermark). Hyperliquid and HIP-3 trades output is unchanged.
- `oxa orders ...`, `oxa l4 ...`, and `oxa l2 ...` reject `--exchange lighter` and `--exchange rh-lighter` with a clear message before any request, instead of failing inside the command.
- `--interval 1m` works on `oxa funding history`, `oxa oi history`, `oxa prices`, `oxa liquidations volume`, and the HIP-4 open interest and price commands. The API now serves 1-minute buckets on those routes. Funding, open interest, and prices used to refuse `1m` before sending the request.
- `oxa orders flow` and `oxa hip4 orders flow` describe `--interval` as the bucket widths the API serves: `1m`, `5m`, `15m`, `1h` (default `1h`). The help used to list `30m`, `4h`, and `1d`, which the API refuses.
- The HIP-4 funding and liquidations refusals now list every exchange that serves those routes.
- Requires `@0xarchive/sdk` 1.12.0 or newer, the release with the Robinhood Chain client, the positions resources, Lighter liquidations, webhooks, CVD, Hyperliquid and HIP-3 breadth, the HIP-3 oracle, HIP-4 questions, wallet classification, the symbol list, and positions freshness.

### Removed

- Flags the API ignores, so they returned the same rows with or without them: `--depth` on `oxa l2 history` (every full-depth checkpoint carries the whole book) and on `oxa l3 history` (every snapshot holds up to 250 orders per side), `--user`, `--status`, and `--order-type` on `oxa spot orders` (Spot order history takes the time range and cursor only), and `--user` on `oxa spot trades`. Hyperliquid, HIP-3, and HIP-4 order history keep their filters. Passing a removed flag is now an unknown-option error.
- No command calls a route the API does not serve: HIP-4 has no full-depth L2 or trigger-level routes, Spot has no order flow, TP/SL, or trigger-level routes, and liquidations by user are Hyperliquid only. The CLI refuses these combinations before any request.

### Fixed

- JSON output larger than the pipe buffer (64 KiB) was cut off when piped to another program, for example `oxa trades fetch ... | jq`, because the process exited before stdout drained. Output is now written in full before the process exits.
- A reader that closes the pipe early (`oxa stream ... | head`) no longer ends the CLI with an EPIPE stack trace; it exits quietly with code 0.

### Documentation

- Documentation links point at docs.0xarchive.io.
- The README documents order-flow paging with `--cursor` and `nextCursor`, every new command above, and WebSocket replay through `oxa stream replay` in place of the note that the CLI did not start replays.

### Development

- vitest 3.2 (was 2.x), the patched line that installs cleanly on the npm bundled with Node 20 and 22.

## 1.9.0 - 2026-09-25

### Added

- Live Lighter streams. `oxa stream orderbook <symbol> --exchange lighter` and `oxa stream trades <symbol> --exchange lighter` subscribe to `lighter_orderbook` and `lighter_trades`, and `oxa stream subscribe` accepts `lighter_orderbook`, `lighter_trades`, `lighter_open_interest`, and `lighter_funding`. Lighter live data is served on `wss://api.0xarchive.io/ws`, the CLI default. The README describes each live message shape and how it differs from replay rows.
- `--interval-ms` on `oxa stream orderbook --exchange lighter` and `oxa stream subscribe lighter_orderbook`: milliseconds between full books, 100 to 5000 (default 1000). It is validated before connecting and rejected on every other channel.
- A Lighter drop notice (`Dropped ~N live <channel> messages ...`) is written to stderr as a warning and the stream continues, because the server keeps the subscription running. The server's `Stopped the <channel> stream ...` notice, and every other server error, still exits with code 4.

### Changed

- `oxa stream subscribe lighter_candles` and `oxa stream subscribe lighter_l3_orderbook` now fail before opening a socket, because both channels are replay-only, and point to `oxa candles --exchange lighter` and `oxa l3 get` / `oxa l3 history`.
- `oxa stream trades`, `oxa stream orderbook`, and `oxa stream liquidations` reject an `--exchange` value they do not support instead of ignoring it.

### Fixed

- `--exchange lighter` and `--exchange hip3` on `oxa stream trades` and `oxa stream orderbook` were ignored, so the command streamed the Hyperliquid channel instead. They now subscribe to the Lighter and HIP-3 channels.
- Stream output in JSON mode is now one JSON record per line (NDJSON), as documented. It was previously pretty-printed across several lines.
- Stopping a stream with `--duration-ms` or Ctrl-C now exits with code 0. It previously exited with code 4 and an empty `websocket error` when the server ended the session without a close handshake.
- The `--format pretty` summary line now shows the event time for live books and fills, not only for replay rows.

## 1.8.1 - 2026-08-31

### Changed

- Documented the open catalog and the Free plan history window in one pass. Every command works on every plan, including Free: every market, route, schema, and served depth. On Free, history is limited to the most recent rolling 30 days with a maximum 30-day span per request or replay; Build and above keep the full retained archive. Plans gate capacity and Free's 30-day history window, not route families, schemas, or served depth.
- Removed the per-subcommand "Check plan" column and the "plan-dependent access" hedges from the Spot and stream sections; route access does not vary by plan.

## 1.8.0 - 2026-08-22

### Added

- HIP-4 candle history via `oxa hip4 candles`, served from 2026-05-02. OHLC values represent implied probabilities.
- Hyperliquid Spot candle history via `oxa spot candles <symbol>`, served from 2025-03-22T10:50:22Z at `1m` through `1w` intervals with a maximum page size of 1000 and opaque cursors.

### Changed

- Coverage guidance now distinguishes route-specific history, raw cadence, and depth.
- Lighter L3 is documented as an order-level feed capped at 250 orders per side from 2026-03-05.
- Lighter trade history is documented as per-fill maker/taker context from 2025-08-27, with market-specific starts.
- Hosted MCP guidance uses OAuth and does not ask for an API key.

## 1.7.0

### Added

- **Hyperliquid Spot support** (`oxa spot ...`). 326 spot pairs covered. Symbols are dashed canonical (`HYPE-USDC`, `PURR-USDC`); the server resolves dashed to wire format internally.
  - `oxa spot pairs` lists every active spot pair.
  - `oxa spot pair <symbol>` returns one pair.
  - `oxa spot orderbook <symbol>` returns the current L2 spot orderbook (live from 2026-05-05).
  - `oxa spot trades <symbol> --start ... --end ...` returns spot trade history (S3 backfill from 2025-03-22). Supports `--user` for server-side wallet filtering.
  - `oxa spot l4 <symbol>` returns the spot L4 orderbook reconstruction (Pro+; live from 2026-05-05).
  - `oxa spot orders <symbol> --start ... --end ...` returns spot order lifecycle history with user attribution (Pro+; live from 2026-05-05).
  - `oxa spot twap <symbol> --start ... --end ...` returns TWAP statuses for one pair (Build+).
  - `oxa spot twap-user <user> --start ... --end ...` returns TWAP statuses for one user wallet across all pairs (Build+).
  - `oxa spot freshness <symbol>` returns per-symbol freshness across orderbook, trades, L4, and TWAP.
- **Realtime spot WebSocket channels** via `oxa stream subscribe <channel> <symbol>`. Supported spot channels: `spot_orderbook`, `spot_trades`, `spot_l4_diffs`, `spot_l4_orders`, `spot_twap`.
- New generic `oxa stream subscribe <channel> <symbol>` verb that forwards any allow-listed channel name to the server. Useful for spot and any future channel not covered by a dedicated `oxa stream <verb>` shortcut.

### Constraints

- Spot has no funding, open interest, or liquidations; candles are served through the dedicated Spot route.
- Spot trades are backfilled from Hyperliquid S3 to 2025-03-22 (the earliest published date). Pre-March 2025 spot history is unrecoverable from any free public archive.
- Spot orderbook, L4, and TWAP are live-only because Hyperliquid does not publish historical orderbook data.

### Other

- Bumped `@0xarchive/sdk` floor to `^1.7.0` to pick up the new `client.spot.*` resources.
- Description updated to mention spot in `package.json` and the README header.

## 1.6.0

- HIP-4 outcome markets command surface (`oxa hip4 ...`).
- WebSocket streaming verbs (`oxa stream liquidations|trades|orderbook`).
- Lighter L3 orderbook (`oxa l3 ...`).
