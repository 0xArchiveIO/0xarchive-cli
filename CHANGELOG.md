# Changelog

## Unreleased

### Added

- `--cursor` on `oxa orders flow` and `oxa hip4 orders flow`: a resume point in Unix ms, and the API starts the response at the first bucket that opens after it. The API does not return `nextCursor` on order flow yet: it arrives with an API switch, and until then `nextCursor` in the order-flow output is `null`.

### Changed

- `--interval 1m` works on `oxa funding history`, `oxa oi history`, `oxa prices`, `oxa liquidations volume`, and the HIP-4 open interest and price commands. The API now serves 1-minute buckets on those routes. Funding, open interest, and prices used to refuse `1m` before sending the request.
- `oxa orders flow` and `oxa hip4 orders flow` describe `--interval` as the bucket widths the API serves: `1m`, `5m`, `15m`, `1h` (default `1h`). The help used to list `30m`, `4h`, and `1d`, which the API refuses.

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
