---
name: tron-token
description: "This skill should be used when the user asks to 'find a token on TRON', 'search TRC-20 token', 'token info on TRON', 'who holds this TRON token', 'is this TRON token safe', 'top TRON tokens', 'trending tokens on TRON', 'token market cap on TRON', 'holder distribution', 'verify TRON contract', or mentions searching for TRC-20 tokens, checking token metadata, holder analysis, contract verification, or discovering trending tokens on the TRON network. For live prices and K-line charts, use tron-market. For swap execution, use tron-swap."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.1.0"
  homepage: "https://trongrid.io"
---

# TRON Token Info

8 commands for token search, metadata, contract verification, holder analysis, trending tokens, token rankings, a heuristic security snapshot (not a full audit), and a one-shot token overview.

## Pre-flight Checks

1. **Confirm Node.js >= 18**:
   ```bash
   node -e "console.log('ok')"  # Node.js >= 18 required
   ```

## Resolve the CLI path

Every command below runs `node "$TRON_API"`. Set `$TRON_API` once per session so it works no matter how the skill was installed (Claude Code plugin, `install.sh` → `~/.tronlink-skills`, or inside the cloned repo):

```bash
TRON_API="${CLAUDE_PLUGIN_ROOT:-$HOME/.tronlink-skills}/scripts/tron_api.mjs"
[ -f "$TRON_API" ] || TRON_API="scripts/tron_api.mjs"   # fallback when run inside the repo
```

## Commands

### 1. Token Info

```bash
node "$TRON_API" token-info --contract <TOKEN_CONTRACT>
```

Returns: name, symbol, decimals, total supply, issuer, logo URL, social links.

### 2. Token Search

```bash
node "$TRON_API" token-search --keyword <KEYWORD>
```

Search tokens by name or symbol. Returns up to 20 matches (built-in known tokens first, then live results) with contract, holders, price, and market cap. Note: without a `TRONSCAN_API_KEY`, live search covers only the top ~100 tokens by holders (TronScan's free search endpoint was retired); known aliases like USDT/USDD/APENFT always resolve.

### 3. Contract Verification

```bash
node "$TRON_API" contract-info --contract <TOKEN_CONTRACT>
```

Returns: contract name, verification status (whether source is verified on Tronscan), creator address, creation time, and energy factor (the % of energy the caller pays). Note: does not return full ABI or bytecode.

### 4. Holder Analysis

```bash
node "$TRON_API" token-holders --contract <TOKEN_CONTRACT> --limit 20
```

Returns: top holders (address + label), each holder's balance in whole tokens and **percentage of total supply** (balance ÷ total_supply), plus the total holder count and token total supply.

### 5. Trending Tokens

```bash
node "$TRON_API" trending-tokens
```

Returns: top TRON-ecosystem tokens ranked by 24h trading volume — name, symbol, price, 24h volume, market cap, and 24h change. Note: the source is **CoinGecko's `tron-ecosystem` market list** (aggregated CEX + DEX volume across all venues), **not** a TRON DEX-only / on-chain DEX trade leaderboard. Treat it as a broad TRON-market trending list rather than a DEX-specific ranking.

### 6. Token Rankings

```bash
node "$TRON_API" token-rankings --sort-by <market_cap|volume|holders|gainers|losers>
```

Returns: ranked list of top TRON tokens by the specified metric — each row includes **holder count**, price, market cap, 24h volume, and 24h change (sourced from TronScan, so `holders` is a genuine holder ranking). Ranks among the top tokens by market cap, re-sorted by the chosen metric.

### 7. Security Audit

```bash
node "$TRON_API" token-security --contract <TOKEN_CONTRACT>
```

Returns a lightweight heuristic risk snapshot:
- Source verified on Tronscan (yes/no)
- Creator address and creation date
- Top-5 holder concentration % and total holder count
- Total transfer count and a 24h liquidity/volume signal
- Derived risk flags (concentration / verification / holder-count) and an overall `⚠️ CAUTION` vs. `✅ relatively safe` recommendation

⚠️ **This is a heuristic, NOT a full audit.** It does **not** check mint/pause/blacklist permissions, proxy upgradeability, or honeypot behavior. Use it as a first-pass filter and always DYOR before trading unfamiliar tokens.

### 8. Token Overview (one-shot dashboard)

```bash
node "$TRON_API" token-overview --contract <TOKEN_CONTRACT_OR_SYMBOL>
```

Returns everything about a token in one call: name, symbol, decimals, price, market cap, 24h volume/change, holder count, total supply, and a heuristic security snapshot (verified, top-5 concentration, risk flag). Accepts symbols like `USDD`, `USDT`, `APENFT`. Use this instead of chaining `token-info` + `token-price` + `token-security`.

## TRON Token Standards

| Standard | Description |
|----------|-------------|
| TRC-20 | Fungible token (like ERC-20), most common |
| TRC-721 | Non-fungible token (NFT) |
| TRC-10 | Native TRON token (legacy, no smart contract) |

Note: TRC-10 tokens use a numeric `tokenId` instead of a contract address.

## Well-Known Tokens

| Token | Contract | Decimals |
|-------|----------|----------|
| USDT | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 |
| USDC | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` | 6 |
| WTRX | `TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR` | 6 |
| BTT | `TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4` | 18 |
| JST | `TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9` | 18 |
| SUN | `TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S` | 18 |
| WIN | `TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7` | 6 |
