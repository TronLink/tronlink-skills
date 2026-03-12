---
name: tron-token
description: "This skill should be used when the user asks to 'find a token on TRON', 'search TRC-20 token', 'token info on TRON', 'who holds this TRON token', 'is this TRON token safe', 'top TRON tokens', 'trending tokens on TRON', 'token market cap on TRON', 'holder distribution', 'verify TRON contract', or mentions searching for TRC-20 tokens, checking token metadata, holder analysis, contract verification, or discovering trending tokens on the TRON network. For live prices and K-line charts, use tron-market. For swap execution, use tron-swap."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.0.0"
  homepage: "https://trongrid.io"
---

# TRON Token Info

7 commands for token search, metadata, contract verification, holder analysis, trending tokens, token rankings, and security audit.

## Pre-flight Checks

1. **Confirm Python & dependencies**:
   ```bash
   node -e "console.log('ok')"  # Node.js >= 18 required
   ```

## Commands

### 1. Token Info

```bash
node scripts/tron_api.mjs token-info --contract <TOKEN_CONTRACT>
```

Returns: name, symbol, decimals, total supply, issuer, logo URL, social links.

### 2. Token Search

```bash
node scripts/tron_api.mjs token-search --keyword <KEYWORD>
```

Search tokens by name or symbol. Returns top 20 matches with contract, market cap, and volume.

### 3. Contract Verification

```bash
node scripts/tron_api.mjs contract-info --contract <TOKEN_CONTRACT>
```

Returns: contract ABI, bytecode hash, creator address, creation time, energy consumption stats, whether source is verified on Tronscan.

### 4. Holder Analysis

```bash
node scripts/tron_api.mjs token-holders --contract <TOKEN_CONTRACT> --limit 20
```

Returns: top holders, their balances, percentage of total supply, holder count.

### 5. Trending Tokens

```bash
node scripts/tron_api.mjs trending-tokens
```

Returns: tokens with highest volume/activity in the last 24h on TRON DEXes.

### 6. Token Rankings

```bash
node scripts/tron_api.mjs token-rankings --sort-by <market_cap|volume|holders|gainers|losers>
```

Returns: ranked list of TRC-20 tokens by the specified metric.

### 7. Security Audit

```bash
node scripts/tron_api.mjs token-security --contract <TOKEN_CONTRACT>
```

Returns: security analysis including:
- Is contract open-source / verified?
- Owner permissions (mint, pause, blacklist)
- Proxy contract detection
- Honeypot risk assessment
- Top holder concentration
- Liquidity lock status

⚠️ **Always run security audit before trading unfamiliar tokens.**

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
