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
| `tron-wallet` | Wallet balance, TRC-20 holdings, TRX/token transfer, transaction history |
| `tron-token` | Token search, metadata, security audit, holder analysis, trending |
| `tron-market` | Token prices, K-line charts, trade history, whale monitoring |
| `tron-swap` | DEX swap via SunSwap V2/V3, quote, route, execute |
| `tron-resource` | Energy & Bandwidth query, estimation, cost optimization |
| `tron-staking` | Stake 2.0 freeze/unfreeze, vote for SRs, claim rewards, APY |

## Updating

```bash
cd ~/.codex/tronlink-skills && git pull
```

## Uninstalling

```bash
rm ~/.agents/skills/tronlink-skills
rm -rf ~/.codex/tronlink-skills
```
