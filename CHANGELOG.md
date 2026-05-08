# Changelog

## 1.7.0

### Added

- **Hyperliquid Spot support** (`oxa spot ...`). 294 spot pairs covered. Symbols are dashed canonical (`HYPE-USDC`, `PURR-USDC`); the server resolves dashed to wire format internally.
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

- Spot has no funding, open interest, liquidations, or candles by design (perpetual constructs).
- Spot trades are backfilled from Hyperliquid S3 to 2025-03-22 (the earliest published date). Pre-March 2025 spot history is unrecoverable from any free public archive.
- Spot orderbook, L4, and TWAP are live-only because Hyperliquid does not publish historical orderbook data.

### Other

- Bumped `@0xarchive/sdk` floor to `^1.7.0` to pick up the new `client.spot.*` resources.
- Description updated to mention spot in `package.json` and the README header.

## 1.6.0

- HIP-4 outcome markets command surface (`oxa hip4 ...`).
- WebSocket streaming verbs (`oxa stream liquidations|trades|orderbook`).
- Lighter L3 orderbook (`oxa l3 ...`).
