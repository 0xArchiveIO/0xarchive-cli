# @0xarchive/cli

Command-line interface for querying historical crypto market data from [0xArchive](https://0xarchive.io). Built for AI agents and automated workflows — access orderbooks, trades, and data freshness across Hyperliquid and Lighter.xyz directly from your terminal.

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
# {"ok":true,"command":"auth test","exchange":"hyperliquid","symbol":"BTC","checked_at":"2026-03-01T12:00:00Z"}

# Get BTC orderbook
oxa orderbook get --exchange hyperliquid --symbol BTC --format pretty

# Get recent trades from Lighter
oxa trades fetch --exchange lighter --symbol BTC --limit 50 --format pretty

# Get historical trades from Hyperliquid (requires time range)
oxa trades fetch --exchange hyperliquid --symbol ETH \
  --start 2026-01-01T00:00:00Z --end 2026-01-01T01:00:00Z

# Check data freshness
oxa freshness --exchange hyperliquid --symbol BTC --format pretty
```

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
oxa orderbook get --exchange <exchange> --symbol <symbol> [--depth <n>] [--timestamp <ms>] [--format <format>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid` or `lighter` |
| `--symbol` | Yes | Coin symbol (e.g. `BTC`, `ETH`) |
| `--depth` | No | Number of price levels per side |
| `--timestamp` | No | Historical timestamp (Unix ms) |
| `--format` | No | `json` (default) or `pretty` |

### `oxa trades fetch`

Fetch trade history for a symbol.

```bash
oxa trades fetch --exchange <exchange> --symbol <symbol> [--start <iso>] [--end <iso>] [--limit <n>] [--out <path>] [--format <format>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid` or `lighter` |
| `--symbol` | Yes | Coin symbol (e.g. `BTC`, `ETH`) |
| `--start` | Conditional | Start time (ISO 8601 or Unix ms) |
| `--end` | Conditional | End time (ISO 8601 or Unix ms) |
| `--limit` | No | Maximum records to return |
| `--cursor` | No | Pagination cursor from previous response |
| `--out` | No | Write full JSON to file path |
| `--format` | No | `json` (default) or `pretty` |

**Note:** Hyperliquid trades always require `--start` and `--end`. Lighter trades can be fetched without a time range (returns recent trades).

### `oxa freshness`

Check data freshness across all data types for a symbol.

```bash
oxa freshness --exchange <exchange> --symbol <symbol> [--format <format>]
```

| Option | Required | Description |
|--------|----------|-------------|
| `--exchange` | Yes | `hyperliquid` or `lighter` |
| `--symbol` | Yes | Coin symbol (e.g. `BTC`, `ETH`) |
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

Errors always go to stderr as JSON, never stdout.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `2` | Validation error (bad arguments) |
| `3` | Authentication error (missing/invalid key) |
| `4` | Network or API error |
| `5` | Internal error |

## Limitations

- **Hyperliquid trades require a time range.** The `trades fetch` command for Hyperliquid always requires `--start` and `--end`. Lighter supports fetching recent trades without a range.
- **No auth persistence.** The API key is not stored on disk. Set `OXA_API_KEY` in your shell profile for persistence.
- **Two exchanges supported.** Currently supports `hyperliquid` and `lighter`. HIP-3 builder perps are accessible via the SDK directly.
- **Single-page default.** The CLI fetches one page per invocation. Use `--cursor` with `trades fetch` to paginate through large result sets.

## For AI Agents

The CLI is designed for agent pipelines:

```bash
# Agent verifies API access
oxa auth test 2>/dev/null && echo "ready"

# Agent fetches data, pipes to jq
oxa orderbook get --exchange hyperliquid --symbol BTC | jq '.midPrice'

# Agent saves trade data for analysis
oxa trades fetch --exchange lighter --symbol ETH --limit 1000 --out trades.json
```

## Links

- [API Docs](https://0xarchive.io/docs)
- [TypeScript SDK](https://npmjs.com/package/@0xarchive/sdk)
- [Python SDK](https://pypi.org/project/oxarchive/)
- [MCP Server](https://github.com/0xArchiveIO/0xarchive-mcp)
- [ClawHub Skill](https://clawhub.ai/0xFantomMenace/0xarchive)

## License

MIT
