# TronLink Wallet Skills

AI Agent skills for TronLink wallet and the TRON ecosystem. Provides wallet management, token queries, market data, DEX swap, resource (Energy/Bandwidth) management, and TRX staking across the TRON network.

**Node.js >= 18 required** (uses native `fetch` and `crypto`).

## Why TRON Needs Its Own Skill Set

TRON has a unique resource model (Energy & Bandwidth) that differs fundamentally from EVM gas. Transactions consume Bandwidth; smart contract calls consume Energy. Users must stake TRX (Stake 2.0) or burn TRX to obtain these resources. This makes TRON wallet operations, cost estimation, and transaction planning significantly different from Ethereum-based chains — and no existing AI agent skill covers this properly.

## Installation — One Command

### Recommended (auto-detects your AI environment)

```bash
curl -sSL https://raw.githubusercontent.com/TronLink/tronlink-skills/main/install.sh | sh
```

This automatically detects Claude Code, Cursor, Codex, OpenCode, or Windsurf and configures everything.

### Uninstall

```bash
# If you still have the repo locally:
sh uninstall.sh

# Or run remotely:
curl -sSL https://raw.githubusercontent.com/TronLink/tronlink-skills/main/uninstall.sh | sh
```

Removes MCP registrations, symlinks, copied config files, and `~/.tronlink-skills`.

### Claude Code

```bash
# Option A: Vercel Skills CLI
npx skills add TronLink/tronlink-skills

# Option B: Claude Code plugin marketplace
/plugin marketplace add TronLink/tronlink-skills
/plugin install tronlink-skills

# Option C: MCP Server (manual)
claude mcp add tronlink -- node ~/.tronlink-skills/scripts/mcp_server.mjs
```

### Cursor / Windsurf

```bash
npx skills add TronLink/tronlink-skills
```

### Codex CLI

```
Fetch and follow instructions from https://raw.githubusercontent.com/TronLink/tronlink-skills/main/.codex/INSTALL.md
```

## Available Skills

| Skill | Description |
|-------|-------------|
| `tron-wallet` | Wallet setup, TRX/TRC-20 balances, transfer TRX & tokens, transaction history, account info |
| `tron-token` | Token search, metadata, contract verification, holder analysis, trending tokens |
| `tron-market` | Real-time prices, K-line data, trade history, whale monitoring, smart money signals |
| `tron-swap` | DEX aggregation swap (SunSwap, etc.), quote, approve, execute |
| `tron-resource` | Energy & Bandwidth query, estimation, resource delegation, cost optimization |
| `tron-staking` | Stake 2.0 freeze/unfreeze TRX, vote for SRs, claim rewards |

## Quick Start

```bash
# Clone the repo
git clone https://github.com/TronLink/tronlink-skills.git
cd tronlink-skills

# Optional: install TronWeb for signing operations
npm install tronweb

# Check TRX balance
node scripts/tron_api.mjs wallet-balance --address TXYZabc123...

# Get token info
node scripts/tron_api.mjs token-info --contract TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

# Get swap quote
node scripts/tron_api.mjs swap-quote \
  --from-token TRX \
  --to-token TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t \
  --amount 100

# Check energy & bandwidth
node scripts/tron_api.mjs resource-info --address TXYZabc123...

# Send TRX (set private key via env var — never on command line)
export TRON_PRIVATE_KEY='your-hex-private-key'
node scripts/tron_api.mjs send-trx --from TAddr1 --to TAddr2 --amount 10

# Send TRC-20 token
node scripts/tron_api.mjs send-token --from TAddr1 --to TAddr2 --contract USDT --amount 5
```

## Zero Dependencies for Read Operations

The CLI uses **native Node.js `fetch`** (Node 18+) and **native `crypto`** for all read-only operations. No `npm install` needed for:

- Balance queries, token info, market data
- Resource estimation, energy price
- Transaction history, address validation
- SR list, staking APY calculation

**Only signing operations** (send-trx, send-token) require `tronweb`:
```bash
npm install tronweb
```

## Prerequisites

- **Node.js 18+** (for native `fetch` support)
- **tronweb** (optional, for signing — `npm install tronweb`)
- TronGrid API Key (optional — apply at [TronGrid Dashboard](https://www.trongrid.io/dashboard))

```bash
# Optional: higher rate limits
export TRONGRID_API_KEY="your-api-key"

# Optional: switch network
export TRON_NETWORK="mainnet"  # or "shasta" / "nile"

# For signing operations (choose one):
export TRON_PRIVATE_KEY="your-hex-private-key"
# or
export TRON_PRIVATE_KEY_FILE="/path/to/keyfile.txt"
```

## Supported Networks

| Network | Endpoint |
|---------|----------|
| Mainnet | https://api.trongrid.io |
| Shasta Testnet | https://api.shasta.trongrid.io |
| Nile Testnet | https://nile.trongrid.io |

## Skill Workflows

**Check & Transfer**: `tron-wallet` (check balance) → `tron-resource` (estimate energy cost) → `tron-wallet` (send TRX/token)

**Research & Buy**: `tron-token` (search token) → `tron-market` (price/chart) → `tron-resource` (check energy) → `tron-swap` (execute trade)

**Staking Flow**: `tron-wallet` (check TRX balance) → `tron-staking` (freeze TRX) → `tron-staking` (vote for SR) → `tron-staking` (claim rewards)

**Resource Optimization**: `tron-resource` (check energy/bandwidth) → `tron-resource` (estimate cost) → `tron-staking` (freeze for energy) OR `tron-resource` (rent energy)

## Architecture

```
Natural Language Input
    ↓
AI Agent (Claude Code / Cursor / OpenClaw / Custom)
    ↓
tron_api.mjs (Node.js 18+, native fetch)
    ↓  ← TronGrid API Key (optional)
    ├── TronGrid HTTP API (read operations — zero deps)
    └── TronWeb SDK (signing operations — npm install tronweb)
    ↓
Structured JSON → Agent interprets → Natural language response
```

## All Commands (41 total)

### Wallet (8 commands)
```
wallet-balance      token-balance       wallet-tokens       tx-history
account-info        validate-address    send-trx            send-token
```

### Token (7 commands)
```
token-info          token-search        contract-info       token-holders
trending-tokens     token-rankings      token-security
```

### Market (8 commands)
```
token-price         kline               trade-history       dex-volume
whale-transfers     large-transfers     pool-info           market-overview
```

### Swap (5 commands)
```
swap-quote          swap-route          swap-approve        swap-execute
tx-status
```

### Resource (7 commands)
```
resource-info       estimate-energy     estimate-bandwidth  energy-price
delegate-resource   energy-rental       optimize-cost
```

### Staking (8 commands)
```
stake-freeze        stake-unfreeze      stake-withdraw      vote
claim-rewards       sr-list             staking-info        staking-apy
```

## TronWeb Signing Examples

For operations that move funds, the CLI outputs ready-to-use TronWeb code snippets:

```javascript
// Send TRX
const TronWeb = require('tronweb');
const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', privateKey: process.env.TRON_PRIVATE_KEY });
const tx = await tronWeb.trx.sendTransaction('TReceiverAddr', 100000000); // 100 TRX

// Freeze for Energy (Stake 2.0)
await tronWeb.transactionBuilder.freezeBalanceV2(1000000000, 'ENERGY'); // 1000 TRX

// Vote for SR
await tronWeb.transactionBuilder.vote({ 'TSRAddress': 1000 });

// Approve token for DEX
const contract = await tronWeb.contract().at('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
await contract.approve('TRouterAddr', '0xffffffff...').send();
```

## Compatible Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| Claude Code | ✅ | Clone repo, add SKILL.md to project context |
| Cursor | ✅ | Clone into project, reference SKILL.md |
| OpenClaw | ✅ | Native skill support |
| Manus | ✅ | Auto-install and execute |
| Dify | ✅ | Use as Code node or API Tool |
| LangChain / CrewAI | ✅ | Wrap as a Tool |

## Security Notes

- Never pass private keys as CLI arguments (visible in `ps`, shell history, logs)
- Use `TRON_PRIVATE_KEY` env var or `TRON_PRIVATE_KEY_FILE` for signing
- All signing happens locally via TronWeb; private keys never leave the machine
- Fund-moving operations always require explicit confirmation
- Read-only operations use public TronGrid API (rate-limited without API key)
- Built-in token symbols (TRX, USDT, USDC, etc.) auto-resolve to verified contracts

## License

MIT License Copyright (c) 2026 TronLink
