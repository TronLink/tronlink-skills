---
name: tron-swap
description: "This skill should be used when the user asks to 'swap tokens on TRON', 'buy token on TRON', 'sell TRC-20 token', 'trade TRX for USDT', 'exchange tokens on SunSwap', 'DEX trade on TRON', 'get swap quote on TRON', 'best route for TRON swap', or mentions swapping, trading, buying, selling, or exchanging tokens on the TRON network. Aggregates liquidity from SunSwap V2/V3, Sun.io, and other TRON DEXes. Do NOT use for staking — use tron-staking. Do NOT use for token research — use tron-token."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.0.0"
  homepage: "https://trongrid.io"
---

# TRON DEX Swap

3 commands for swap quote, route optimization, and transaction status tracking (read-only queries).

## Pre-flight Checks

1. **Confirm Python & dependencies**:
   ```bash
   node -e "console.log('ok')"  # Node.js >= 18 required
   ```

2. **Check energy before swapping**: Swaps consume significant Energy (typically 50,000–200,000). Run:
   ```bash
   node scripts/tron_api.mjs resource-info --address <YOUR_ADDRESS>
   ```
   If energy is insufficient, consider freezing TRX first (`tron-staking`) or accept TRX burn cost.

## Commands

### 1. Swap Quote

```bash
node scripts/tron_api.mjs swap-quote \
  --from-token <FROM_CONTRACT_OR_TRX> \
  --to-token <TO_CONTRACT_OR_TRX> \
  --amount <HUMAN_READABLE_AMOUNT>
```

Returns: expected output amount, price impact, route path, minimum received (with slippage), estimated energy cost.

⚠️ **Amount is human-readable** — pass `100` for 100 TRX, NOT `100000000`.

Example:
```bash
# Quote: 100 TRX → USDT
node scripts/tron_api.mjs swap-quote \
  --from-token TRX \
  --to-token TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t \
  --amount 100
```

### 2. Best Route

```bash
node scripts/tron_api.mjs swap-route \
  --from-token <FROM_CONTRACT> \
  --to-token <TO_CONTRACT> \
  --amount <AMOUNT>
```

Returns: optimal route across SunSwap V2, V3, Sun.io — may include multi-hop routes (e.g., TRX → WTRX → USDT).

### 3. Transaction Status

```bash
node scripts/tron_api.mjs tx-status --txid <TRANSACTION_HASH>
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
| TRX → TRC-20 | ~345 | ~65,000 | ~13 TRX |
| TRC-20 → TRX | ~345 | ~50,000 | ~10 TRX |
| TRC-20 → TRC-20 | ~345 | ~130,000 | ~26 TRX |
| Approve (first time) | ~345 | ~30,000 | ~6 TRX |

⚠️ Energy costs fluctuate. Always check current energy price:
```bash
node scripts/tron_api.mjs energy-price
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

1. **Security audit**: Run `node scripts/tron_api.mjs token-security --contract <TOKEN>` before trading unfamiliar tokens
2. **Liquidity check**: Run `node scripts/tron_api.mjs pool-info --contract <TOKEN>` — avoid tokens with < $10k liquidity
3. **Energy check**: Run `node scripts/tron_api.mjs resource-info --address <YOUR_ADDRESS>` — swap without energy burns TRX
4. **Price impact**: If price impact > 3%, consider splitting into smaller trades
