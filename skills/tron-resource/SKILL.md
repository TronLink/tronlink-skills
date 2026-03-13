---
name: tron-resource
description: "This skill should be used when the user asks about 'TRON energy', 'TRON bandwidth', 'how much energy do I need', 'energy cost on TRON', 'bandwidth insufficient', 'resource delegation on TRON', 'rent energy on TRON', 'TRON transaction fee', 'why is my TRON transaction expensive', 'optimize TRON costs', or mentions Energy, Bandwidth, resource management, fee estimation, or cost optimization on the TRON network. This is a TRON-specific concept with no direct equivalent on EVM chains. Do NOT use for staking/voting — use tron-staking. Do NOT use for balance queries — use tron-wallet."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.0.0"
  homepage: "https://trongrid.io"
---

# TRON Resource Management (Energy & Bandwidth)

6 commands for resource query, energy estimation, bandwidth estimation, energy price, energy rental marketplace, and cost optimization.

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
- A USDT transfer typically costs ~65,000 Energy ≈ 13-27 TRX if burned

### Cost Comparison
| Operation | Energy Needed | TRX Burned (no staking) | With Staked Energy |
|-----------|:------------:|:-----------------------:|:-----------------:|
| TRX transfer | 0 | 0 (free bandwidth) | 0 |
| USDT transfer | ~65,000 | ~13-27 TRX | 0 TRX |
| SunSwap V2 swap | ~65,000-200,000 | ~13-40 TRX | 0 TRX |
| Contract deployment | ~200,000-1,000,000+ | ~40-200+ TRX | 0 TRX |
| Approve token | ~30,000 | ~6-12 TRX | 0 TRX |

## Commands

### 1. Resource Info

```bash
node scripts/tron_api.mjs resource-info --address <TRON_ADDRESS>
```

Returns:
- Free Bandwidth: remaining / 600
- Staked Bandwidth: available / total
- Energy: available / total
- TRX frozen for Energy
- TRX frozen for Bandwidth

### 2. Energy Estimation

```bash
node scripts/tron_api.mjs estimate-energy \
  --contract <CONTRACT_ADDRESS> \
  --function <FUNCTION_SIGNATURE> \
  --params <PARAMS> \
  --caller <CALLER_ADDRESS>
```

Shortcut for common operations:
```bash
# Estimate energy for USDT transfer
node scripts/tron_api.mjs estimate-energy \
  --contract TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t \
  --function "transfer(address,uint256)" \
  --params "<TO_ADDRESS>,1000000" \
  --caller <YOUR_ADDRESS>
```

Returns: estimated Energy consumption and equivalent TRX cost.

### 3. Bandwidth Estimation

```bash
node scripts/tron_api.mjs estimate-bandwidth --tx-size <BYTES>
```

Returns: estimated Bandwidth consumption, whether free allowance covers it.

### 4. Current Energy Price

```bash
node scripts/tron_api.mjs energy-price
```

Returns: current Energy price in SUN (1 TRX = 1,000,000 SUN), TRX cost per 10,000 Energy, and recent price trend.

### 5. Resource Rental Marketplace

```bash
node scripts/tron_api.mjs energy-rental --amount <ENERGY_NEEDED>
```

Returns: available energy rental offers from third-party platforms with pricing.

Common rental platforms:
- TronNRG (https://tronnrg.com)
- JustLend Energy Rental
- Community energy providers

### 6. Cost Optimization Report

```bash
node scripts/tron_api.mjs optimize-cost --address <TRON_ADDRESS>
```

Returns: personalized recommendations:
- How much TRX to freeze for typical usage pattern
- Whether renting energy is cheaper than freezing
- Whether burning TRX is acceptable for low-frequency usage
- Estimated monthly savings with different strategies

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
