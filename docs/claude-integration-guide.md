# TronLink Skills — Complete Guide for Claude Integration

## Overview: Three Integration Methods

| Method | Use Case | Difficulty | Installation Required |
|--------|----------|------------|----------------------|
| **Claude Code + SKILL.md** | Daily development, on-chain queries | ⭐ Easy | Just clone the repo |
| **MCP Server** | Claude Desktop / Claude Code deep integration | ⭐⭐ Medium | MCP configuration needed |
| **Claude.ai file upload** | Temporary use, no installation | ⭐ Easy | Just upload the file |

---

## Method 1: Claude Code (Recommended)

Claude Code is Anthropic's command-line AI agent that can directly read SKILL.md files in your project and execute commands.

### Steps

```bash
# 1. Install Claude Code
npm install -g @anthropic-ai/claude-code

# 2. Clone the project
git clone https://github.com/TronLink/tronlink-skills.git
cd tronlink-skills

# 3. Start Claude Code
claude
```

### Usage

After starting, Claude Code **automatically reads** `CLAUDE.md` and `skills/*/SKILL.md`. Just ask questions in natural language:

```
💬 You: Check the TRX balance for T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb

🤖 Claude: Querying...
   [Executing: node scripts/tron_api.mjs wallet-balance --address T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb]

   The TRX balance for this address is 1,234.56 TRX, with 500 TRX frozen for Energy.

💬 You: Does this address have enough Energy for a USDT transfer?

🤖 Claude: Let me check the resource status...
   [Executing: node scripts/tron_api.mjs resource-info --address T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb]

   Current available Energy is 45,000, but a USDT transfer requires approximately 65,000 Energy.
   Recommend freezing more TRX, or this transaction will automatically burn approximately 8.4 TRX as a fee.

💬 You: Show the current TRON Super Representative list, which one has the lowest commission?

🤖 Claude: [Executing: node scripts/tron_api.mjs sr-list --limit 30]
   ...
```

### How It Works

When Claude Code starts, it will:
1. Read `CLAUDE.md` in the project root → understand project structure and available commands
2. Based on user questions, locate the corresponding `skills/tron-*/SKILL.md`
3. Extract command format, build and execute `node scripts/tron_api.mjs <command>`
4. Parse JSON output and respond to the user in natural language

---

## Method 2: MCP Server (Deep Integration)

MCP (Model Context Protocol) is Anthropic's tool protocol. After wrapping Skills as an MCP Server, Claude Desktop and Claude Code can call them like built-in tools.

### Adding MCP in Claude Code

```bash
# One-line command to add
claude mcp add tronlink -- node /your/path/to/tronlink-skills/scripts/mcp_server.mjs
```

After adding, Claude Code will automatically recognize 25 TRON tools (tron_wallet_balance, tron_token_price, etc.), no need to manually specify commands.

### Configuring in Claude Desktop

Edit the config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tronlink": {
      "command": "node",
      "args": ["/your/absolute/path/to/tronlink-skills/scripts/mcp_server.mjs"],
      "env": {
        "TRONGRID_API_KEY": "your-api-key (optional)",
        "TRON_NETWORK": "mainnet"
      }
    }
  }
}
```

After restarting Claude Desktop, you can use TRON-related tools directly in conversations.

### 25 Tools Provided by MCP

| Tool Name | Function |
|-----------|----------|
| `tron_wallet_balance` | Check TRX balance |
| `tron_token_balance` | Check TRC-20 token balance |
| `tron_wallet_tokens` | List all token holdings |
| `tron_tx_history` | Transaction history |
| `tron_account_info` | Account details |
| `tron_validate_address` | Validate address |
| `tron_token_info` | Token metadata |
| `tron_token_search` | Search tokens |
| `tron_token_holders` | Top holders |
| `tron_trending_tokens` | Trending tokens |
| `tron_token_rankings` | Token rankings |
| `tron_token_security` | Security audit |
| `tron_token_price` | Real-time price |
| `tron_kline` | K-line data |
| `tron_whale_transfers` | Whale monitoring |
| `tron_market_overview` | Market overview |
| `tron_swap_quote` | DEX quote |
| `tron_tx_status` | Transaction status |
| `tron_resource_info` | Energy/Bandwidth query |
| `tron_energy_price` | Energy price |
| `tron_estimate_energy` | Energy estimation |
| `tron_optimize_cost` | Cost optimization report |
| `tron_sr_list` | Super Representative list |
| `tron_staking_info` | Staking details |
| `tron_staking_apy` | APY estimation |

---

## Method 3: Use Directly in Claude.ai Conversations

If you don't want to install anything, you can use it directly in claude.ai conversations (requires computer use capability):

1. Upload `tron_api.mjs` to the conversation
2. Tell Claude: "Please run this script and query XXX for me"
3. Claude will use the built-in computer tool to execute the command

For example, in the current conversation, you can say:

```
Use tron_api.mjs to run a security audit on the USDT contract TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
```

---

## Method 4: Cursor / Windsurf IDE

```bash
# Clone into project directory
git clone https://github.com/TronLink/tronlink-skills.git

# Open in Cursor, Agent automatically reads SKILL.md
# Or use MCP method:
# Cursor Settings → MCP → Add Server → point to mcp_server.mjs
```

---

## Environment Variables

```bash
# TronGrid API Key (optional, increases rate limits)
export TRONGRID_API_KEY="your-api-key"

# Switch network (default: mainnet)
export TRON_NETWORK="mainnet"   # or "shasta" / "nile"
```

---

## Quick Verification

After installation, run the following commands to verify everything works:

```bash
# Test address validation (offline)
node scripts/tron_api.mjs validate-address --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

# Test Energy estimation (offline)
node scripts/tron_api.mjs estimate-bandwidth --tx-size 345

# Test APY calculation (offline)
node scripts/tron_api.mjs staking-apy --amount 10000

# Test network queries (requires network)
node scripts/tron_api.mjs market-overview
node scripts/tron_api.mjs token-price --contract TRX
```

---

## FAQ

### Q: Claude Code doesn't automatically recognize SKILL.md?
A: Make sure you start `claude` in the project root directory and the `CLAUDE.md` file exists.

### Q: MCP Server won't connect?
A: Check that the path to `mcp_server.mjs` is an absolute path, and Node.js >= 18.

### Q: API requests failing?
A: TronGrid public endpoints have rate limits. Set `TRONGRID_API_KEY` for higher limits. Apply at https://www.trongrid.io/dashboard.

### Q: Does this support transactions (transfer/swap)?
A: This skill set is read-only. It supports balance queries, token info, market data, resource estimation, and staking info. Transaction signing is not supported.
