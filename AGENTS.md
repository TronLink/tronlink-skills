# TronLink Wallet Skills

Read-only AI-agent tools for the TRON network: wallet balances, token info & security heuristics, market data, DEX swap quotes, Energy/Bandwidth resource planning, and TRX Stake 2.0 info.

**Read-only — no private keys, no signing, no transfers.** Every command is a read query against public TRON APIs (TronGrid / TronScan / CoinGecko / Sun.io router). Requires **Node.js >= 18**.

## Running commands

All skills call one CLI. Resolve its path once per session, then use `node "$TRON_API"`:

```bash
TRON_API="${CLAUDE_PLUGIN_ROOT:-$HOME/.tronlink-skills}/scripts/tron_api.mjs"
[ -f "$TRON_API" ] || TRON_API="scripts/tron_api.mjs"   # fallback when run inside the repo
node "$TRON_API" --help
```

Optional environment:

```bash
export TRONGRID_API_KEY="..."        # higher rate limits (optional)
export TRON_NETWORK="mainnet"        # or shasta | nile
```

## Skills — when to use which

| Skill | Use for |
|-------|---------|
| `tron-wallet` | TRX/TRC-20 balances, holdings, tx history, account info, address validation |
| `tron-token` | Token search, metadata, holders, trending/rankings, heuristic security snapshot |
| `tron-market` | Prices, OHLC candles, transfers, volume, whale monitoring, network overview |
| `tron-swap` | DEX swap quote & route (SunSwap V2/V3, Sun.io), tx status |
| `tron-resource` | Energy & Bandwidth query, estimation, energy price, cost optimization |
| `tron-staking` | SR list, staking info, APY estimation (Stake 2.0) |

Each skill's `SKILL.md` (under `skills/<name>/`) lists its exact commands. The CLI exposes **40 commands** total (including one-shot `wallet-overview`/`token-overview` and a `health-check` diagnostic) — run `node "$TRON_API" --help` for the full list.

## MCP alternative

A bundled MCP server (`scripts/mcp_server.mjs`) exposes **39 `tron_*` tools** backed by the same data, for editors/agents that speak the Model Context Protocol over stdio.

## Honest capability notes

- `tron-token` security is a **heuristic snapshot** (verification, holder concentration, holder count) — not a full audit; it does not detect honeypots, mint/pause/blacklist permissions, or proxy upgradeability.
- `tron-market` K-line returns **OHLC only** (no volume) and `interval` selects a time-range bucket, not exact candle spacing.
- `swap-route` is currently an alias of `swap-quote`.
- When an upstream API errors or is rate-limited, commands return an explicit `{ error, status }` envelope (they do **not** fabricate `0`/`Unknown`/empty results). Surface it as "data unavailable" — never report a `0` price/fee/balance as if it were real.
