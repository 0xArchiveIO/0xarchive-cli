# Changelog

## 1.10.0 - 2026-09-28

### Added

- Lighter on Robinhood Chain, the second Lighter deployment, as `--exchange rh-lighter` on every shared market-data command that Lighter mainnet supports: instruments, order book and order book history, trades (canonical range and preliminary recent tier), candles, funding, open interest, liquidations, prices, summary, freshness, and `auth test`. It is USDG-quoted with 84 markets (57 perp, 27 spot); perps are uppercase (`BTC`) and spot markets are dashed (`AAPL-USDG`). Trades and liquidations are served from 2026-06-26 20:10:26 UTC, the venue's first trade; order book, open interest, and funding from 2026-08-22 18:43 UTC; candles from 2026-06-26 once they are enabled for this deployment. It has no L3.
- Live Robinhood Chain streams: `oxa stream orderbook <symbol> --exchange rh-lighter` and `oxa stream trades <symbol> --exchange rh-lighter`, and `oxa stream subscribe` accepts `rh_lighter_orderbook`, `rh_lighter_trades`, `rh_lighter_open_interest`, and `rh_lighter_funding`. Messages have the same shapes as the `lighter_*` live channels, `--interval-ms` (100 to 5000) works on `rh_lighter_orderbook`, and drop notices on `rh_lighter_*` channels are warnings, as on Lighter mainnet. They are served on `wss://api.0xarchive.io/ws`, the CLI default. `rh_lighter_candles` is replay-only and is rejected before a socket opens.
- Account positions, `oxa positions ...`, on `hyperliquid`, `hip3`, `lighter`, and `rh-lighter`: `get` (latest snapshot, or as of `--timestamp`), `history` (hourly snapshots), `changes` (the change log), `market` (every open position in one market, with `--side`, `--min-value`, and `--include-system` on Lighter), `summary` (long/short positioning now or hourly), and `all` (every open position at one hour). Hyperliquid and HIP-3 add `account` and `account-history`. Hyperliquid and HIP-3 are keyed by `--address`; Lighter by `--account <index>`. JSON output includes the response `meta` (as-of time, snapshot, source, quality, staleness, and finalization fields).
- `oxa accounts by-l1 --l1-address 0x...` lists the Lighter mainnet account indices owned by an L1 address.
- `--cursor` on `oxa orders flow` and `oxa hip4 orders flow`: a resume point in Unix ms, and the API starts the response at the first bucket that opens after it. The API does not return `nextCursor` on order flow yet: it arrives with an API switch, and until then `nextCursor` in the order-flow output is `null`.
- A package-contents check (`npm run check:pack`) and a CI workflow that runs the typecheck, tests, build, and that check.

### Changed

- `oxa liquidations history` and `oxa liquidations volume` accept `--exchange lighter` and `--exchange rh-lighter`; they were previously refused. Lighter rows keep the trade's raw fields (`liquidationType`, `usdAmount`, both accounts, `rawJson`); Robinhood Chain rows from before live capture (2026-08-22) were backfilled from the venue's finalized export and carry `source` `bucket` with an empty `rawJson`. Lighter volume buckets carry a total and a count with no long/short split. `oxa liquidations user` stays Hyperliquid only.
- On Lighter ranges (both deployments), `oxa trades fetch` passes the response `meta` through, including the finalization fields (`meta.finalizedThrough`, and `meta.clampedTo` when the range was clamped to the watermark). Hyperliquid and HIP-3 trades output is unchanged.
- `oxa orders ...`, `oxa l4 ...`, and `oxa l2 ...` reject `--exchange lighter` and `--exchange rh-lighter` with a clear message before any request, instead of failing inside the command.
- `--interval 1m` works on `oxa funding history`, `oxa oi history`, `oxa prices`, `oxa liquidations volume`, and the HIP-4 open interest and price commands. The API now serves 1-minute buckets on those routes. Funding, open interest, and prices used to refuse `1m` before sending the request.
- `oxa orders flow` and `oxa hip4 orders flow` describe `--interval` as the bucket widths the API serves: `1m`, `5m`, `15m`, `1h` (default `1h`). The help used to list `30m`, `4h`, and `1d`, which the API refuses.
- The HIP-4 funding and liquidations refusals now list every exchange that serves those routes.
- Requires `@0xarchive/sdk` 1.12.0 or newer, the release with the Robinhood Chain client, the positions resources, and Lighter liquidations.

### Documentation

- Documentation links point at docs.0xarchive.io.

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
