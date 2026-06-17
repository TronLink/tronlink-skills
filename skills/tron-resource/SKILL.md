---
name: tron-resource
description: "This skill should be used when the user asks about 'TRON energy', 'TRON bandwidth', 'how much energy do I need', 'energy cost on TRON', 'bandwidth insufficient', 'resource delegation on TRON', 'rent energy on TRON', 'TRON transaction fee', 'why is my TRON transaction expensive', 'optimize TRON costs', or mentions Energy, Bandwidth, resource management, fee estimation, or cost optimization on the TRON network. This is a TRON-specific concept with no direct equivalent on EVM chains. Do NOT use for staking/voting — use tron-staking. Do NOT use for balance queries — use tron-wallet."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.1.0"
  homepage: "https://trongrid.io"
---

# TRON Resource Management (Energy & Bandwidth)

9 commands for resource query, energy estimation, bandwidth estimation, energy price, bandwidth price, transaction cost estimation, chain parameters, energy rental marketplace, and cost optimization.

## TRON Resource Model — Essential Knowledge

Unlike Ethereum's gas model, TRON uses TWO separate resources:

### Bandwidth
- Consumed by **ALL transactions** (proportional to transaction size in bytes)
- Every account gets **600 free Bandwidth daily** (resets at 00:00 UTC)
- A basic TRX transfer uses ~267 Bandwidth (covered by free allowance)
- If insufficient: **TRX is burned** at a rate of ~1000 SUN per Bandwidth point

### Energy
- Consumed **ONLY by smart contract calls** (TRC-20 transfers, DEX swaps, DeFi interactions)
- **No free daily allowance**
- Must be obtained by: freezing TRX (Stake 2.0), renting from marketplace, or burning TRX
- A USDT transfer typically costs ~32,000–65,000 Energy. If burned, TRX cost = energy × `getEnergyFee` ÷ 1e6 — **≈ 3–6.5 TRX at the mid-2026 fee of ~100 SUN** (was ~13–27 TRX at the old 420-SUN rate). Always check the live fee with `energy-price`.

### Cost Comparison
| Operation | Energy Needed | TRX Burned (no staking) | With Staked Energy |
|-----------|:------------:|:-----------------------:|:-----------------:|
| TRX transfer | 0 | 0 (free bandwidth) | 0 |
| USDT transfer | ~65,000 | ~3-6.5 TRX | 0 TRX |
| SunSwap V2 swap | ~65,000-200,000 | ~6.5-20 TRX | 0 TRX |
| Contract deployment | ~200,000-1,000,000+ | ~20-100+ TRX | 0 TRX |
| Approve token | ~30,000 | ~3 TRX | 0 TRX |

> ⚠️ The **TRX-burned** column assumes the live `getEnergyFee` ≈ **100 SUN (mid-2026)** and scales linearly with it (it was 420 SUN in 2023–2024 → ~4.2× these numbers). Run `energy-price` for the current value before quoting costs.

## Resolve the CLI path

Every command below runs `node "$TRON_API"`. Set `$TRON_API` once per session so it works no matter how the skill was installed (Claude Code plugin, `install.sh` → `~/.tronlink-skills`, or inside the cloned repo):

```bash
TRON_API="${CLAUDE_PLUGIN_ROOT:-$HOME/.tronlink-skills}/scripts/tron_api.mjs"
[ -f "$TRON_API" ] || TRON_API="scripts/tron_api.mjs"   # fallback when run inside the repo
```

## Commands

### 1. Resource Info

```bash
node "$TRON_API" resource-info --address <TRON_ADDRESS>
```

Returns:
- Free Bandwidth: remaining / 600
- Staked Bandwidth: available / total
- Energy: available / total
- TRX frozen for Energy
- TRX frozen for Bandwidth

### 2. Energy Estimation

```bash
node "$TRON_API" estimate-energy \
  --contract <CONTRACT_ADDRESS> \
  --function <FUNCTION_SIGNATURE> \
  --params <PARAMS> \
  --caller <CALLER_ADDRESS>
```

Shortcut for common operations:
```bash
# Estimate energy for USDT transfer
node "$TRON_API" estimate-energy \
  --contract TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t \
  --function "transfer(address,uint256)" \
  --params "<TO_ADDRESS>,1000000" \
  --caller <YOUR_ADDRESS>
```

Returns: estimated Energy consumption (and `energy_price_sun` fetched live from chain params) plus the equivalent TRX cost.

⚠️ `--params` must be **ABI-encoded** (hex, no `0x`) when the function takes arguments — the script does not encode `address,amount` strings for you. For `transfer(address,uint256)` that's the 64-hex-padded recipient concatenated with the 64-hex-padded amount. Omit `--params` to estimate the base call cost.

### 3. Bandwidth Estimation

```bash
node "$TRON_API" estimate-bandwidth --tx-size <BYTES>
```

Returns: estimated Bandwidth consumption, whether free allowance covers it.

### 4. Current Energy Price

```bash
node "$TRON_API" energy-price
```

Returns: the live on-chain Energy price in SUN (1 TRX = 1,000,000 SUN), TRX cost per 10,000 Energy, and example burn costs at the current price for a USDT transfer and a SunSwap V2 swap. Note: this is a **point-in-time snapshot** — it does **not** include a historical price trend.

### 5. Resource Rental Marketplace

```bash
node "$TRON_API" energy-rental --amount <ENERGY_NEEDED>
```

Returns: a **directory** of third-party energy-rental platforms (names + links) for the requested amount. Note: it does **not** fetch live per-platform pricing — open each platform to compare current rates.

Common rental platforms:
- TronNRG (https://tronnrg.com)
- JustLend Energy Rental
- Community energy providers

### 6. Cost Optimization Report

```bash
node "$TRON_API" optimize-cost --address <TRON_ADDRESS>
```

Returns: personalized recommendations:
- How much TRX to freeze for typical usage pattern
- Whether renting energy is cheaper than freezing
- Whether burning TRX is acceptable for low-frequency usage
- Estimated monthly savings with different strategies

### 7. Live Bandwidth Price

```bash
node "$TRON_API" bandwidth-price
```

Returns the live on-chain Bandwidth price (`getTransactionFee`, SUN/byte) and example burn costs. Complements `energy-price` (Energy ↔ Bandwidth are TRON's two separate resources).

### 8. Transaction Cost Estimator

```bash
node "$TRON_API" tx-cost --type <trc20-transfer|trx-transfer|trc20-transfer-existing|approve|swap-v2|swap-v3>
```

One-stop cost for a common operation: bandwidth + energy needed, the **live** energy/bandwidth prices, and total TRX burned if you have no staked resources (0 if you do). Use this to answer "how much will this transfer/swap cost me?" without chaining `energy-price` + `estimate-*` by hand.

### 9. Chain Parameters

```bash
node "$TRON_API" chain-params
```

Returns key TRON governance parameters: energy price, bandwidth price, account-creation fee, memo fee, max fee limit, SR block reward — with TRX-denominated derivations. Good for cost transparency and verifying live fees.

## Decision Tree for Agents

```
User wants to do a smart contract operation?
  ├── Check energy: resource-info --address <addr>
  ├── Has enough energy? → Proceed
  └── Not enough energy?
      ├── Frequent user (daily TRC-20 transfers)?
      │   └── Recommend: Freeze TRX for Energy (tron-staking)
      ├── Occasional user (1-2 tx/week)?
      │   └── Recommend: Rent energy from marketplace
      └── One-time user?
          └── Recommend: Accept TRX burn (simplest)
```

## Important Notes

- Energy and Bandwidth **recover over 24 hours** after use (not instant)
- Staked TRX earns Energy/Bandwidth continuously but is locked for minimum 14 days
- Delegated resources can be reclaimed after the lock period expires
- Energy price fluctuates based on network demand — check before large operations
- Free Bandwidth (600/day) is sufficient for ~2 basic TRX transfers daily
