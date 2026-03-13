#!/bin/bash
# ============================================================
# TronLink Skills — Claude Code Integration Guide
# ============================================================

# ────────────────────────────────────────────────────────────
# Method 1: Claude Code (Recommended)
# ────────────────────────────────────────────────────────────

# 1. Install Claude Code (requires Node.js 18+)
npm install -g @anthropic-ai/claude-code

# 2. Clone TronLink Skills into your project
git clone https://github.com/TronLink/tronlink-skills.git
cd tronlink-skills

# 3. Start Claude Code
claude

# 5. Claude Code will automatically read CLAUDE.md and skills/*/SKILL.md
#    Then you can give instructions in natural language, for example:

# 💬 "Check the TRX balance for this address: T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
# 💬 "Run a security audit on the USDT token"
# 💬 "What is the current Energy price on the TRON network?"
# 💬 "Get a swap quote for 100 TRX to USDT"
# 💬 "Show the TRON Super Representative list"
# 💬 "Analyze the resource usage for this address and give optimization suggestions"

# Claude Code will automatically:
#   1) Read the corresponding SKILL.md to understand the command format
#   2) Execute node scripts/tron_api.mjs <command>
#   3) Parse the JSON result and respond in natural language


# ────────────────────────────────────────────────────────────
# Method 2: Cursor / Windsurf IDE Agent
# ────────────────────────────────────────────────────────────

# 1. Clone into your project directory
git clone https://github.com/TronLink/tronlink-skills.git

# 2. Open the project in Cursor, the Agent will automatically read SKILL.md
# 3. Use natural language instructions in Cursor Chat


# ────────────────────────────────────────────────────────────
# Method 3: Use as MCP Server (Claude Desktop / Claude Code)
# ────────────────────────────────────────────────────────────

# Refer to the mcp_server.mjs file below to wrap Skills as an MCP Server
# Then configure in Claude Desktop's claude_desktop_config.json:
#
# {
#   "mcpServers": {
#     "tronlink": {
#       "command": "node",
#       "args": ["/path/to/tronlink-skills/scripts/mcp_server.mjs"]
#     }
#   }
# }
