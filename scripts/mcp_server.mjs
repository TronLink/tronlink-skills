#!/usr/bin/env node

/**
 * mcp_server.mjs — MCP (Model Context Protocol) Server for TronLink Skills
 *
 * Wraps tron_api.mjs commands as MCP tools, so Claude Desktop / Claude Code
 * can call them directly as function tools.
 *
 * Usage:
 *   node scripts/mcp_server.mjs
 *
 * Configure in Claude Desktop (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "tronlink": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/tronlink-skills/scripts/mcp_server.mjs"],
 *         "env": {
 *           "TRONGRID_API_KEY": "your-optional-api-key"
 *         }
 *       }
 *     }
 *   }
 *
 * Configure in Claude Code:
 *   claude mcp add tronlink-skills -- node /absolute/path/to/tronlink-skills/scripts/mcp_server.mjs
 */

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRON_API = join(__dirname, "tron_api.mjs");

// ---------------------------------------------------------------------------
// MCP Tool Definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  // === Wallet ===
  {
    name: "tron_wallet_balance",
    description: "Check TRX balance and account overview for a TRON address",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "TRON address (T...)" } },
      required: ["address"],
    },
    command: ["wallet-balance", "--address"],
    argKeys: ["address"],
  },
  {
    name: "tron_token_balance",
    description: "Check TRC-20 token balance. Supports symbol shortcuts (USDT, USDC) or contract address.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "TRON address" },
        contract: { type: "string", description: "Token contract or symbol (e.g. USDT, TR7NHq...)" },
      },
      required: ["address", "contract"],
    },
    command: ["token-balance", "--address", null, "--contract"],
    argKeys: ["address", "contract"],
  },
  {
    name: "tron_wallet_tokens",
    description: "List all TRC-20 token holdings for an address",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "TRON address" } },
      required: ["address"],
    },
    command: ["wallet-tokens", "--address"],
    argKeys: ["address"],
  },
  {
    name: "tron_tx_history",
    description: "Get recent transaction history for a TRON address",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "TRON address" },
        limit: { type: "number", description: "Number of transactions (default 20)" },
      },
      required: ["address"],
    },
    command: ["tx-history", "--address"],
    argKeys: ["address"],
    optionalArgs: { limit: "--limit" },
  },
  {
    name: "tron_account_info",
    description: "Get detailed account info including resources, frozen balances, and votes",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "TRON address" } },
      required: ["address"],
    },
    command: ["account-info", "--address"],
    argKeys: ["address"],
  },
  {
    name: "tron_validate_address",
    description: "Validate whether a string is a valid TRON address",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "Address to validate" } },
      required: ["address"],
    },
    command: ["validate-address", "--address"],
    argKeys: ["address"],
  },
  {
    name: "tron_wallet_approvals",
    description: "List active TRC-20 token approvals (allowances) for an address. Flags UNLIMITED approvals — the main wallet-drain risk. Read-only; revoking requires the wallet.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "TRON address" },
        limit: { type: "number", description: "Max approvals to return (default 50)" },
      },
      required: ["address"],
    },
    command: ["wallet-approvals", "--address"],
    argKeys: ["address"],
    optionalArgs: { limit: "--limit" },
  },
  {
    name: "tron_wallet_overview",
    description: "One-shot wallet dashboard for an address: TRX balance, known TRC-20 holdings, Energy/Bandwidth resources, and staking summary in one call",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "TRON address" } },
      required: ["address"],
    },
    command: ["wallet-overview", "--address"],
    argKeys: ["address"],
  },

  // === Token ===
  {
    name: "tron_token_info",
    description: "Get token metadata: name, symbol, supply, holders, price, social links",
    inputSchema: {
      type: "object",
      properties: { contract: { type: "string", description: "Token contract or symbol" } },
      required: ["contract"],
    },
    command: ["token-info", "--contract"],
    argKeys: ["contract"],
  },
  {
    name: "tron_contract_info",
    description: "Get contract metadata: name, verification status, creator, creation time, energy factor",
    inputSchema: {
      type: "object",
      properties: { contract: { type: "string", description: "Contract address" } },
      required: ["contract"],
    },
    command: ["contract-info", "--contract"],
    argKeys: ["contract"],
  },
  {
    name: "tron_token_search",
    description: "Search TRC-20 tokens by name or symbol keyword",
    inputSchema: {
      type: "object",
      properties: { keyword: { type: "string", description: "Search keyword" } },
      required: ["keyword"],
    },
    command: ["token-search", "--keyword"],
    argKeys: ["keyword"],
  },
  {
    name: "tron_token_holders",
    description: "Get top holders of a TRC-20 token with balance and percentage",
    inputSchema: {
      type: "object",
      properties: {
        contract: { type: "string", description: "Token contract address" },
        limit: { type: "number", description: "Number of holders (default 20)" },
      },
      required: ["contract"],
    },
    command: ["token-holders", "--contract"],
    argKeys: ["contract"],
    optionalArgs: { limit: "--limit" },
  },
  {
    name: "tron_trending_tokens",
    description: "Get trending TRON-ecosystem tokens by 24h volume (CoinGecko tron-ecosystem list, not a DEX-only ranking)",
    inputSchema: { type: "object", properties: {} },
    command: ["trending-tokens"],
    argKeys: [],
  },
  {
    name: "tron_token_rankings",
    description: "Rank TRC-20 tokens by market_cap, volume, holders, gainers, or losers",
    inputSchema: {
      type: "object",
      properties: {
        sort_by: {
          type: "string",
          description: "Sort metric",
          enum: ["market_cap", "volume", "holders", "gainers", "losers"],
        },
      },
    },
    command: ["token-rankings"],
    argKeys: [],
    optionalArgs: { sort_by: "--sort-by" },
  },
  {
    name: "tron_token_security",
    description: "Heuristic risk snapshot for a TRC-20 token (verification, holder concentration, holder count) — NOT a full audit; does not detect honeypots, mint/pause/blacklist, or proxy upgradeability",
    inputSchema: {
      type: "object",
      properties: { contract: { type: "string", description: "Token contract address" } },
      required: ["contract"],
    },
    command: ["token-security", "--contract"],
    argKeys: ["contract"],
  },
  {
    name: "tron_token_overview",
    description: "One-shot token dashboard: name, symbol, price, market cap, 24h volume/change, holders, supply, and a heuristic security snapshot in one call",
    inputSchema: {
      type: "object",
      properties: { contract: { type: "string", description: "Token contract or symbol (USDT, USDD, ...)" } },
      required: ["contract"],
    },
    command: ["token-overview", "--contract"],
    argKeys: ["contract"],
  },

  // === Market ===
  {
    name: "tron_token_price",
    description: "Get current price for TRX or any TRC-20 token",
    inputSchema: {
      type: "object",
      properties: { contract: { type: "string", description: "Token contract, symbol, or 'TRX'" } },
      required: ["contract"],
    },
    command: ["token-price", "--contract"],
    argKeys: ["contract"],
  },
  {
    name: "tron_kline",
    description: "Get K-line (candlestick OHLC) data for a token — open/high/low/close only, no volume; interval selects a CoinGecko time-range bucket",
    inputSchema: {
      type: "object",
      properties: {
        contract: { type: "string", description: "Token contract or symbol" },
        interval: { type: "string", description: "Interval: 1m, 5m, 15m, 1h, 4h, 1d, 1w" },
        limit: { type: "number", description: "Number of candles" },
      },
      required: ["contract"],
    },
    command: ["kline", "--contract"],
    argKeys: ["contract"],
    optionalArgs: { interval: "--interval", limit: "--limit" },
  },
  {
    name: "tron_whale_transfers",
    description: "Monitor large token transfers (whale activity)",
    inputSchema: {
      type: "object",
      properties: {
        contract: { type: "string", description: "Token contract" },
        min_value: { type: "number", description: "Minimum transfer amount in token units (whole tokens, not USD)" },
      },
      required: ["contract"],
    },
    command: ["whale-transfers", "--contract"],
    argKeys: ["contract"],
    optionalArgs: { min_value: "--min-value" },
  },
  {
    name: "tron_market_overview",
    description: "Get TRON network overview: TRX price, 24h change, market cap, 24h volume, and latest/confirmed block (no account/transaction totals)",
    inputSchema: { type: "object", properties: {} },
    command: ["market-overview"],
    argKeys: [],
  },
  {
    name: "tron_trade_history",
    description: "Get recent TRC-20 token transfers for a token (raw transfers — no execution price or DEX source)",
    inputSchema: {
      type: "object",
      properties: {
        contract: { type: "string", description: "Token contract or symbol" },
        limit: { type: "number", description: "Number of transfers (default 50)" },
      },
      required: ["contract"],
    },
    command: ["trade-history", "--contract"],
    argKeys: ["contract"],
    optionalArgs: { limit: "--limit" },
  },
  {
    name: "tron_dex_volume",
    description: "Get 24h volume and liquidity snapshot for a token (from market data)",
    inputSchema: {
      type: "object",
      properties: {
        contract: { type: "string", description: "Token contract or symbol" },
        period: { type: "string", description: "Period label (5m, 1h, 4h, 24h)" },
      },
      required: ["contract"],
    },
    command: ["dex-volume", "--contract"],
    argKeys: ["contract"],
    optionalArgs: { period: "--period" },
  },
  {
    name: "tron_large_transfers",
    description: "List recent large TRX transfers network-wide above a threshold",
    inputSchema: {
      type: "object",
      properties: {
        min_trx: { type: "number", description: "Minimum TRX amount (default 100000)" },
        limit: { type: "number", description: "Number of results (default 20)" },
      },
    },
    command: ["large-transfers"],
    argKeys: [],
    optionalArgs: { min_trx: "--min-trx", limit: "--limit" },
  },
  {
    name: "tron_pool_info",
    description: "Get a token's liquidity/volume snapshot from market data (not a full pool/TVL breakdown — use swap-quote for routing)",
    inputSchema: {
      type: "object",
      properties: { contract: { type: "string", description: "Token contract or symbol" } },
      required: ["contract"],
    },
    command: ["pool-info", "--contract"],
    argKeys: ["contract"],
  },

  // === Swap ===
  {
    name: "tron_swap_quote",
    description: "Get DEX swap quote with best route across SunSwap V2/V3. Amount is human-readable.",
    inputSchema: {
      type: "object",
      properties: {
        from_token: { type: "string", description: "Source token (TRX, USDT, or contract)" },
        to_token: { type: "string", description: "Target token" },
        amount: { type: "string", description: "Human-readable amount (e.g. '100' for 100 TRX)" },
        slippage: { type: "number", description: "Max slippage tolerance in percent (default 0.5; e.g. 1 for 1%). Range 0–50." },
      },
      required: ["from_token", "to_token", "amount"],
    },
    command: ["swap-quote", "--from-token", null, "--to-token", null, "--amount"],
    argKeys: ["from_token", "to_token", "amount"],
    optionalArgs: { slippage: "--slippage" },
  },
  {
    name: "tron_tx_status",
    description: "Check transaction status, energy/bandwidth used, and result",
    inputSchema: {
      type: "object",
      properties: { txid: { type: "string", description: "Transaction hash" } },
      required: ["txid"],
    },
    command: ["tx-status", "--txid"],
    argKeys: ["txid"],
  },

  // === Resource ===
  {
    name: "tron_resource_info",
    description: "Get Energy and Bandwidth status for an address. Shows remaining, used, and tips.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "TRON address" } },
      required: ["address"],
    },
    command: ["resource-info", "--address"],
    argKeys: ["address"],
  },
  {
    name: "tron_energy_price",
    description: "Get current Energy price and common operation costs (USDT transfer, swap, etc.)",
    inputSchema: { type: "object", properties: {} },
    command: ["energy-price"],
    argKeys: [],
  },
  {
    name: "tron_bandwidth_price",
    description: "Get the live on-chain Bandwidth price (getTransactionFee, SUN per byte) and example burn costs",
    inputSchema: { type: "object", properties: {} },
    command: ["bandwidth-price"],
    argKeys: [],
  },
  {
    name: "tron_tx_cost",
    description: "Estimate total cost (bandwidth + energy + TRX burned with no resources) for a common operation type, using live on-chain fees",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Operation type",
          enum: ["trx-transfer", "trc20-transfer", "trc20-transfer-existing", "approve", "swap-v2", "swap-v3"],
        },
      },
    },
    command: ["tx-cost"],
    argKeys: [],
    optionalArgs: { type: "--type" },
  },
  {
    name: "tron_chain_params",
    description: "Get key TRON governance chain parameters (energy/bandwidth price, account-creation fee, memo fee, max fee limit, SR block reward)",
    inputSchema: { type: "object", properties: {} },
    command: ["chain-params"],
    argKeys: [],
  },
  {
    name: "tron_estimate_energy",
    description: "Estimate energy consumption and TRX cost for a smart contract call",
    inputSchema: {
      type: "object",
      properties: {
        contract: { type: "string", description: "Contract address" },
        func: { type: "string", description: "Function signature, e.g. transfer(address,uint256)" },
        caller: { type: "string", description: "Caller address" },
        params: { type: "string", description: "ABI-encoded parameters (optional)" },
      },
      required: ["contract", "func", "caller"],
    },
    command: ["estimate-energy", "--contract", null, "--function", null, "--caller"],
    argKeys: ["contract", "func", "caller"],
    optionalArgs: { params: "--params" },
  },
  {
    name: "tron_optimize_cost",
    description: "Personalized cost optimization report: freeze vs. rent vs. burn analysis",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "TRON address" } },
      required: ["address"],
    },
    command: ["optimize-cost", "--address"],
    argKeys: ["address"],
  },
  {
    name: "tron_estimate_bandwidth",
    description: "Estimate bandwidth for a transaction size and whether the 600/day free allowance covers it",
    inputSchema: {
      type: "object",
      properties: { tx_size: { type: "number", description: "Transaction size in bytes (default 267)" } },
    },
    command: ["estimate-bandwidth"],
    argKeys: [],
    optionalArgs: { tx_size: "--tx-size" },
  },
  {
    name: "tron_energy_rental",
    description: "List third-party energy rental marketplace options for a given energy amount",
    inputSchema: {
      type: "object",
      properties: { amount: { type: "number", description: "Energy amount needed (default 65000)" } },
    },
    command: ["energy-rental"],
    argKeys: [],
    optionalArgs: { amount: "--amount" },
  },

  // === Staking ===
  {
    name: "tron_sr_list",
    description: "List TRON Super Representatives with votes, ranking, and efficiency",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Number of SRs (default 30)" } },
    },
    command: ["sr-list"],
    argKeys: [],
    optionalArgs: { limit: "--limit" },
  },
  {
    name: "tron_staking_info",
    description: "Get staking overview: frozen TRX, votes, pending unfreezes, unclaimed rewards",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "TRON address" } },
      required: ["address"],
    },
    command: ["staking-info", "--address"],
    argKeys: ["address"],
  },
  {
    name: "tron_staking_apy",
    description: "Estimate staking APY and rewards for a given TRX amount",
    inputSchema: {
      type: "object",
      properties: { amount: { type: "string", description: "TRX amount to stake (default 10000)" } },
    },
    command: ["staking-apy"],
    argKeys: [],
    optionalArgs: { amount: "--amount" },
  },

  // === Diagnostics ===
  {
    name: "tron_health_check",
    description: "Check reachability and latency of the upstream APIs (TronGrid, TronScan, CoinGecko, Sun.io router) plus Node version — useful when data looks missing or rate-limited",
    inputSchema: { type: "object", properties: {} },
    command: ["health-check"],
    argKeys: [],
  },
];

// ---------------------------------------------------------------------------
// Execute tron_api.mjs command
// ---------------------------------------------------------------------------

function buildArgs(tool, input) {
  const args = [...tool.command];

  // Fill in required positional args
  let keyIdx = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === null && keyIdx < tool.argKeys.length) {
      args[i] = String(input[tool.argKeys[keyIdx]] || "");
      keyIdx++;
    } else if (args[i]?.startsWith("--") && keyIdx < tool.argKeys.length) {
      // Next position is the value
      const nextKey = tool.argKeys[keyIdx];
      if (i + 1 >= args.length || args[i + 1]?.startsWith("--")) {
        args.splice(i + 1, 0, String(input[nextKey] || ""));
        keyIdx++;
      }
    }
  }

  // For simple pattern: ["cmd", "--flag"] + argKeys mapping
  for (const key of tool.argKeys) {
    if (input[key] !== undefined && !args.includes(String(input[key]))) {
      args.push(String(input[key]));
    }
  }

  // Optional args
  if (tool.optionalArgs) {
    for (const [inputKey, flag] of Object.entries(tool.optionalArgs)) {
      if (input[inputKey] !== undefined && input[inputKey] !== null) {
        args.push(flag, String(input[inputKey]));
      }
    }
  }

  return args;
}

function runCommand(args) {
  return new Promise((resolve) => {
    execFile("node", [TRON_API, ...args], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ error: err.message, stderr: stderr?.trim() });
      } else {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ output: stdout.trim() });
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC Protocol (stdio transport)
// ---------------------------------------------------------------------------

const rl = createInterface({ input: process.stdin, terminal: false });
let buffer = "";

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
  process.stdout.write(msg);
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n";
  process.stdout.write(msg);
}

async function handleRequest(req) {
  const { id, method, params } = req;

  switch (method) {
    case "initialize":
      sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "tronlink-skills", version: "1.1.0" },
      });
      break;

    case "notifications/initialized":
      // No response needed
      break;

    case "tools/list":
      sendResponse(id, {
        tools: TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      break;

    case "tools/call": {
      const toolName = params?.name;
      const toolInput = params?.arguments || {};
      const tool = TOOLS.find(t => t.name === toolName);

      if (!tool) {
        sendError(id, -32602, `Unknown tool: ${toolName}`);
        break;
      }

      const args = buildArgs(tool, toolInput);
      const result = await runCommand(args);

      sendResponse(id, {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      });
      break;
    }

    default:
      sendError(id, -32601, `Method not found: ${method}`);
  }
}

rl.on("line", async (line) => {
  buffer += line;
  try {
    const req = JSON.parse(buffer);
    buffer = "";
    await handleRequest(req);
  } catch {
    // Might be partial JSON, wait for more
    if (buffer.length > 100000) buffer = ""; // Safety reset
  }
});

// Signal ready on stderr (convention)
process.stderr.write("TronLink Skills MCP Server started\n");
