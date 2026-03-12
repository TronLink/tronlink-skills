# TRON Staking Guide — Domain Knowledge

## Stake 2.0 Overview

Stake 2.0 (introduced in proposal #81) replaced the legacy Stake 1.0 system. The key improvements:

1. **Separated freezing from voting** — You can freeze TRX for resources without voting, and vote without specifying a resource type.
2. **Flexible delegation** — Delegate Energy or Bandwidth to any address without transferring TRX.
3. **Partial unfreezing** — Unfreeze any portion of your staked TRX (not all-or-nothing).

## Lifecycle

```
              ┌─── Freeze TRX ───┐
              │                   │
              ▼                   ▼
         Get Energy          Get Bandwidth
              │                   │
              └───── Vote ────────┘
                      │
                      ▼
              Earn TRX Rewards
              (every 6 hours)
                      │
                      ▼
              Claim Rewards
                      │
                      ▼
              Unfreeze TRX
                      │
                      ▼
            14-day Wait Period
                      │
                      ▼
              Withdraw TRX
```

## Super Representatives (SRs)

TRON uses a Delegated Proof-of-Stake (DPoS) consensus mechanism:

- **27 Super Representatives** produce blocks in rotation
- **100+ SR Partners** serve as backup nodes
- SRs are elected every 6 hours via voting
- Block rewards: 16 TRX per block (produced every 3 seconds)
- Voting rewards: distributed proportionally to voters

### Reward Distribution

Total daily rewards ≈ 461,000 TRX (block + voting rewards)

Your share: `(your_votes / total_network_votes) × daily_reward_pool × (1 - sr_commission)`

### SR Selection Criteria

When choosing which SR to vote for:
1. **Commission rate** — Lower is better for voters (ranges from 0% to 100%)
2. **Block production rate** — Higher means more reliable
3. **Community contribution** — Some SRs fund ecosystem projects
4. **Uptime history** — Consistent block production

## Voting Strategy

### Maximize Rewards
- Vote for SRs with 0% commission (all rewards go to voters)
- Split votes across multiple low-commission SRs for diversification
- Re-vote if a preferred SR's commission changes

### Support the Ecosystem
- Some community SRs fund development, education, and tools
- Voting for them supports TRON ecosystem growth (may have higher commission)

### Compound Returns
- Claim rewards regularly
- Re-freeze claimed TRX for more Energy/TP
- Re-vote with increased TRON Power

## Economics

### Current Approximate APY: 3-5%

Factors affecting APY:
- Total TRX staked network-wide (more stake = lower individual APY)
- SR commission rates
- TRX price (affects USD-denominated returns)
- Block production efficiency

### Break-even Analysis

If you're freezing TRX primarily for Energy to avoid transaction burns:

```
Annual energy savings = daily_txs × energy_per_tx × energy_price_sun × 365
Annual staking reward = frozen_trx × apy

If energy_savings + staking_reward > opportunity_cost → Freeze
```

For a user doing 1 USDT transfer per day:
- Energy saved: 65,000 × 420 SUN × 365 = 9,963,000,000 SUN ≈ 9,963 TRX/year
- TRX to freeze for 65,000 daily energy: ~14,500 TRX
- Staking reward on 14,500 TRX at 4%: 580 TRX/year
- Total benefit: ~10,543 TRX/year — highly cost-effective

## Common Mistakes

1. **Forgetting to vote after freezing** — Freezing gives resources but NOT rewards. You must explicitly vote to earn.

2. **Unfreezing removes votes** — If you unfreeze, your votes are removed. Re-vote after re-freezing.

3. **Not claiming rewards** — Rewards don't auto-compound. Claim periodically and re-freeze.

4. **Freezing too little** — Due to the proportional resource model, freezing a small amount may not provide meaningful energy.

5. **Ignoring the 14-day lock** — Plan ahead; unfreezing takes 14 days. Don't freeze TRX you might need urgently.
