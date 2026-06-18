# Installing TronLink Skills for Codex CLI

## Prerequisites

- Node.js 18+
- Git

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/TronLink/tronlink-skills ~/.codex/tronlink-skills
   ```

2. **Create the skills symlink:**

   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/tronlink-skills/skills ~/.agents/skills/tronlink-skills
   ```

3. **Restart Codex** to discover the skills.

## Verify

```bash
ls ~/.agents/skills/tronlink-skills
```

You should see: `tron-wallet`, `tron-token`, `tron-market`, `tron-swap`, `tron-resource`, `tron-staking`.

## Available Skills

| Skill | When to Use |
|-------|-------------|
| `tron-wallet` | Wallet balance, TRC-20 holdings, transaction history, account info |
| `tron-token` | Token search, metadata, holder analysis, trending, security heuristic |
| `tron-market` | Token prices, OHLC charts, transfers, whale monitoring |
| `tron-swap` | DEX swap quote & route (SunSwap V2/V3, Sun.io), tx status |
| `tron-resource` | Energy & Bandwidth query, estimation, cost optimization |
| `tron-staking` | Stake 2.0 info: SR list, staking state, APY |

> All skills are **read-only** — they query on-chain/market data and do not sign, transfer, swap, freeze, vote, or claim.

## Updating

```bash
cd ~/.codex/tronlink-skills && git pull
```

## Uninstalling

```bash
rm ~/.agents/skills/tronlink-skills
rm -rf ~/.codex/tronlink-skills
```
