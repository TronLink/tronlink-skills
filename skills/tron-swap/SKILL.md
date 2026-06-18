---
name: tron-swap
description: "This skill should be used when the user asks to 'swap tokens on TRON', 'buy token on TRON', 'sell TRC-20 token', 'trade TRX for USDT', 'exchange tokens on SunSwap', 'DEX trade on TRON', 'get swap quote on TRON', 'best route for TRON swap', or mentions swapping, trading, buying, selling, or exchanging tokens on the TRON network. Aggregates liquidity from SunSwap V2/V3, Sun.io, and other TRON DEXes. Do NOT use for staking — use tron-staking. Do NOT use for token research — use tron-token."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.1.0"
  homepage: "https://trongrid.io"
---

# TRON DEX Swap

3 commands for swap quote, route optimization, and transaction status tracking (read-only queries).

## Pre-flight Checks

1. **Confirm Node.js >= 18**:
   ```bash
   node -e "console.log('ok')"  # Node.js >= 18 required
   ```

2. **Check energy before swapping**: Swaps consume significant Energy (typically 50,000–200,000). Run:
   ```bash
   node "$TRON_API" resource-info --address <YOUR_ADDRESS>
   ```
   If energy is insufficient, consider freezing TRX first (`tron-staking`) or accept TRX burn cost.

## Resolve the CLI path

Every command below runs `node "$TRON_API"`. Set `$TRON_API` once per session so it works no matter how the skill was installed (Claude Code plugin, `install.sh` → `~/.tronlink-skills`, or inside the cloned repo):

```bash
TRON_API="${CLAUDE_PLUGIN_ROOT:-$HOME/.tronlink-skills}/scripts/tron_api.mjs"
[ -f "$TRON_API" ] || TRON_API="scripts/tron_api.mjs"   # fallback when run inside the repo
```

> **Read-only:** these commands quote and inspect swaps; they do **not** sign or broadcast transactions.

## Commands

### 1. Swap Quote

```bash
node "$TRON_API" swap-quote \
  --from-token <FROM_CONTRACT_OR_TRX> \
  --to-token <TO_CONTRACT_OR_TRX> \
  --amount <HUMAN_READABLE_AMOUNT> \
  [--slippage 0.5]
```

Returns: expected output amount, `slippage_pct`, `minimum_received` (= amount_out × (1 − slippage), your worst-case fill), price impact, fee, route path, and estimated energy cost. Default slippage is 0.5%; `--slippage` is validated to the **0–50%** range (a larger value is rejected rather than producing a negative `minimum_received`). `--amount` must be a positive number. The same `slippage` parameter is also exposed on the MCP `tron_swap_quote` tool.

⚠️ **Amount is human-readable** — pass `100` for 100 TRX, NOT `100000000`.

Example:
```bash
# Quote: 100 TRX → USDT
node "$TRON_API" swap-quote \
  --from-token TRX \
  --to-token TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t \
  --amount 100
```

### 2. Best Route

```bash
node "$TRON_API" swap-route \
  --from-token <FROM_CONTRACT> \
  --to-token <TO_CONTRACT> \
  --amount <AMOUNT>
```

Returns the same best-route data as `swap-quote` — this command is currently an **alias** of it. The chosen route, `path`, `pool_versions`, and price impact are already part of the `swap-quote` response; multi-hop paths (e.g. TRX → WTRX → USDT) appear in those fields when the router returns them.

### 3. Transaction Status

```bash
node "$TRON_API" tx-status --txid <TRANSACTION_HASH>
```

Returns: confirmation status, block number, energy used, bandwidth used, result.

## DEX Router Addresses (Mainnet)

| DEX | Router Contract |
|-----|----------------|
| SunSwap V2 Router | `TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax` |
| SunSwap V3 Router | `TQAvWQpT9H916GckwWDJNhYZvQMkuRL7PN` |
| Sun.io Swap | `TKcEU8ekq2ZoFzLSGFYCUY6aocJBX9X31b` |

## Swap Cost Estimation

TRON swap costs differ from EVM chains:

| Operation | Bandwidth | Energy | TRX Burn (if no resources) |
|-----------|-----------|--------|---------------------------|
| TRX → TRC-20 | ~345 | ~65,000 | ~6.5 TRX |
| TRC-20 → TRX | ~345 | ~50,000 | ~5 TRX |
| TRC-20 → TRC-20 | ~345 | ~130,000 | ~13 TRX |
| Approve (first time) | ~345 | ~30,000 | ~3 TRX |

⚠️ TRX-burn = energy × `getEnergyFee` ÷ 1e6. The figures above use the live fee ≈ **100 SUN (mid-2026)**; it was 420 SUN in 2023–2024 (~4.2× higher). Always check the current price:
```bash
node "$TRON_API" energy-price
```

## Slippage Guide

| Token Type | Recommended Slippage |
|-----------|---------------------|
| Stablecoins (USDT↔USDC) | 0.1% |
| Major tokens (TRX, JST, SUN) | 0.5% |
| Mid-cap tokens | 1-2% |
| Low-cap / Meme tokens | 3-5% |
| New launches | 5-10% (⚠️ high risk) |

## Safety Checks Before Swap

1. **Security heuristic**: Run `node "$TRON_API" token-security --contract <TOKEN>` before trading unfamiliar tokens (first-pass risk snapshot, not a full audit)
2. **Liquidity check**: Run `node "$TRON_API" pool-info --contract <TOKEN>` — avoid tokens with < $10k liquidity
3. **Energy check**: Run `node "$TRON_API" resource-info --address <YOUR_ADDRESS>` — swap without energy burns TRX
4. **Price impact**: If price impact > 3%, consider splitting into smaller trades
