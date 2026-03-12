---
name: tron-staking
description: "This skill should be used when the user asks to 'stake TRX', 'freeze TRX', 'unfreeze TRX', 'vote for SR', 'TRON super representative', 'claim TRON rewards', 'TRON staking rewards', 'how to earn with TRX', 'delegate TRX', 'Stake 2.0', 'unfreeze period', or mentions staking, freezing, unfreezing, voting for Super Representatives, claiming rewards, or Stake 2.0 on the TRON network. Do NOT use for resource queries — use tron-resource. Do NOT use for balance checks — use tron-wallet."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.0.0"
  homepage: "https://trongrid.io"
---

# TRON Staking (Stake 2.0)

9 commands for freeze, unfreeze, withdraw, vote, claim rewards, SR list, staking info, delegation, and APY estimation.

## TRON Stake 2.0 — Essential Knowledge

Stake 2.0 replaced the legacy Stake 1.0 system. Key differences:
- Freezing and voting are **separate operations** (Stake 1.0 combined them)
- Resources can be **delegated** to other addresses
- Unfreezing has a **14-day waiting period** before TRX can be withdrawn
- Voting for Super Representatives (SRs) earns **TRX rewards** (~3-5% APY)

### Staking Lifecycle
```
Freeze TRX → Get Energy or Bandwidth → Vote for SR → Earn Rewards → Unfreeze → Wait 14 days → Withdraw
```

## Commands

### Signing Setup (required for commands 1-5)

```bash
# Set private key via environment variable (never pass on command line)
export TRON_PRIVATE_KEY='your-hex-private-key'
# Or use a key file:
export TRON_PRIVATE_KEY_FILE='/path/to/keyfile.txt'
```

### 1. Freeze TRX

```bash
node scripts/tron_api.mjs stake-freeze \
  --amount <TRX_AMOUNT> \
  --resource <ENERGY|BANDWIDTH>
```

⚠️ **Human-in-the-loop**: Always confirm the amount and resource type before executing.

Frozen TRX immediately generates the corresponding resource but is locked for a minimum of 14 days.

### 2. Unfreeze TRX

```bash
node scripts/tron_api.mjs stake-unfreeze \
  --amount <TRX_AMOUNT> \
  --resource <ENERGY|BANDWIDTH>
```

⚠️ Unfreezing starts a **14-day waiting period**. TRX is NOT immediately available.

### 3. Withdraw Unfrozen TRX

```bash
node scripts/tron_api.mjs stake-withdraw
```

Withdraws TRX that has completed the 14-day waiting period after unfreeze.

### 4. Vote for Super Representative

```bash
node scripts/tron_api.mjs vote \
  --votes '<SR_ADDRESS_1>:<VOTE_COUNT>,<SR_ADDRESS_2>:<VOTE_COUNT>'
```

Rules:
- 1 frozen TRX = 1 TRON Power (TP) = 1 vote
- You can split votes across multiple SRs
- Total votes cannot exceed your TRON Power
- Votes reset if you unfreeze; re-vote after re-freezing
- Voting is FREE (no energy/bandwidth cost)

### 5. Claim Staking Rewards

```bash
node scripts/tron_api.mjs claim-rewards
```

Claims accumulated voting rewards. Rewards accumulate every 6 hours (maintenance cycle).

### 6. Super Representative List

```bash
node scripts/tron_api.mjs sr-list --limit 30
```

Returns: SR name, address, total votes, vote percentage, block production rate, APY estimate, commission rate.

### 7. My Staking Info

```bash
node scripts/tron_api.mjs staking-info --address <TRON_ADDRESS>
```

Returns:
- TRX frozen for Energy (amount, unlock date)
- TRX frozen for Bandwidth (amount, unlock date)
- TRON Power (total votes available)
- Current votes (which SRs, how many)
- Unclaimed rewards
- Pending unfreezes (amount, unlock date)
- Delegated resources (to whom, amount)

### 8. Delegate Staked Resources

```bash
node scripts/tron_api.mjs delegate-resource \
  --to <RECIPIENT_ADDRESS> \
  --resource <ENERGY|BANDWIDTH> \
  --amount <TRX_AMOUNT> \
  --lock-period <DAYS>
```

Delegates Energy or Bandwidth to another address without transferring TRX. Minimum lock: 0 days (can reclaim anytime).

### 9. APY Estimation

```bash
node scripts/tron_api.mjs staking-apy --amount <TRX_TO_STAKE>
```

Returns: estimated annual yield based on current network parameters, SR rewards, and commission rates.

## Top Super Representatives (Reference)

| SR | Focus | Commission |
|----|-------|-----------|
| Poloniex | Exchange | 20% |
| Binance Staking | Exchange | 20% |
| SUN Community | DeFi | 0% (community) |
| JustinSunTron | Foundation | 20% |
| CryptoGuyInZA | Community | 0% |
| sesameseed | Community | Compound |

⚠️ SR list changes frequently. Always check current data with `sr-list`.

## Staking Strategy Guide for Agents

### For Frequent Users (Daily TRC-20 Transfers)
- Freeze enough TRX to cover daily Energy needs (~65,000 Energy per USDT transfer)
- Rule of thumb: 1 TRX frozen ≈ 4.5 Energy per day
- For 1 USDT transfer/day: freeze ~14,500 TRX
- Vote for highest-APY SR to earn rewards

### For Occasional Users
- Keep TRX liquid, accept burning for occasional transactions
- Or rent Energy from marketplace (cheaper for < 5 tx/month)

### For Passive Income
- Freeze all available TRX
- Vote for SRs with lowest commission and highest APY
- Claim rewards every few days (claiming itself costs minimal bandwidth)
- Compound by re-freezing claimed rewards

## Common Pitfalls

**"Cannot unfreeze"**: TRX has not been frozen for the minimum 14 days, or you have pending votes that need to be removed first.

**"Insufficient TRON Power"**: You're trying to vote with more TP than you have frozen. Check `staking-info` for available TP.

**"Withdraw failed"**: The 14-day unfreeze waiting period has not completed. Check pending unfreezes in `staking-info`.

**"Reward is 0"**: You haven't voted, or the maintenance cycle (6 hours) hasn't completed yet. Vote first, then wait at least 6 hours.
