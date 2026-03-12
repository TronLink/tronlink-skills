# TRON Resource Model — Domain Knowledge

## Overview

TRON's fee model is fundamentally different from Ethereum's gas system. Understanding this is critical for any agent operating on TRON.

## Bandwidth

**What it is**: A resource consumed by ALL transactions, proportional to the byte size of the transaction.

**Free allowance**: Every activated TRON account gets 600 free Bandwidth points per day, resetting at 00:00 UTC.

**Consumption**:
- Basic TRX transfer: ~267 Bandwidth
- TRC-20 transfer: ~345 Bandwidth
- Smart contract interaction: ~345-500 Bandwidth

**If insufficient**: TRX is burned at approximately 1,000 SUN (0.001 TRX) per Bandwidth point.

**Recovery**: Bandwidth recovers linearly over 24 hours after use.

## Energy

**What it is**: A resource consumed ONLY by smart contract calls (TRC-20 transfers, DEX swaps, DeFi protocols).

**No free allowance**: Unlike Bandwidth, there is ZERO free Energy.

**Consumption examples**:
| Operation | Energy |
|-----------|--------|
| USDT transfer (simple) | ~32,000 |
| USDT transfer (to new address) | ~65,000 |
| SunSwap V2 simple swap | ~65,000-100,000 |
| SunSwap V2 multi-hop | ~130,000-200,000 |
| SunSwap V3 swap | ~100,000-150,000 |
| Token approval | ~30,000 |
| Contract deployment | ~200,000-1,000,000+ |

**If insufficient**: TRX is burned. The burn rate depends on `getEnergyFee` chain parameter (typically 420 SUN per Energy unit).

**Cost calculation**: `TRX burned = energy_used × energy_price_sun / 1,000,000`

Example: USDT transfer (65,000 Energy × 420 SUN) = 27,300,000 SUN = 27.3 TRX

## How to Get Energy

### 1. Stake TRX (Stake 2.0)
- Freeze TRX → receive Energy proportional to stake
- Formula: `your_energy = (your_frozen_trx / total_network_frozen_trx) × total_energy_limit`
- Approximate: 1 TRX frozen ≈ 4.5 Energy per day (varies with network)
- Minimum lock: 14 days
- Also earns voting rewards if you vote for SRs

### 2. Rent Energy
- Third-party marketplaces sell energy at market rates
- Usually cheaper than burning TRX for occasional users
- No lock-up required

### 3. Burn TRX
- Simplest option — TRX is deducted automatically
- Most expensive option for frequent users
- No setup required

## Decision Matrix

| Usage Pattern | Best Strategy | Why |
|--------------|---------------|-----|
| Daily TRC-20 transfers | Freeze TRX for Energy | Amortized cost is lowest |
| Weekly transfers | Rent Energy | No 14-day lock, cheaper than burning |
| Monthly or less | Burn TRX | Simplest, acceptable cost |
| Heavy DeFi user | Freeze + rent excess | Combination for peak coverage |

## Energy Price History

The `getEnergyFee` parameter is set by TRON governance:
- 2021: 140 SUN/Energy
- 2022: 280 SUN/Energy
- 2023: 420 SUN/Energy
- 2024-2025: 420 SUN/Energy (current)

Higher energy prices make staking more valuable.

## Common Pitfalls

1. **"Why was 27 TRX deducted for a USDT transfer?"** — No staked energy; TRX was burned to cover energy cost.

2. **"Transaction failed, out of energy"** — The fee_limit was set too low. Default is 150 TRX; increase for complex operations.

3. **"I froze TRX but still have no energy"** — The amount frozen is too small relative to total network stake. Check `resource-info` for actual energy received.

4. **"Free bandwidth depleted"** — 600 daily bandwidth covers only ~2 basic transfers. Use staked bandwidth or accept small TRX burn.

5. **"Different USDT transfer costs"** — First transfer TO a new address costs ~65,000 energy; subsequent transfers to the same address cost ~32,000.
