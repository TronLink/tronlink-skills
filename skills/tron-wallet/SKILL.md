---
name: tron-wallet
description: "This skill should be used when the user asks to 'check my TRX balance', 'show my TRON holdings', 'what tokens do I have on TRON', 'check my TRON wallet', 'TronLink balance', 'view my TRC-20 tokens', 'TRON transaction history', 'account info on TRON', or mentions checking wallet balance, viewing transaction history, or managing a TronLink wallet. Do NOT use for swap/trading — use tron-swap instead. Do NOT use for staking — use tron-staking instead."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.1.0"
  homepage: "https://trongrid.io"
---

# TRON Wallet Management

8 commands for wallet balance, TRC-20 holdings, transaction history, account info, address validation, TRC-20 approval (allowance) audit, and a one-shot wallet overview. Read-only — no signing or transfers.

## Pre-flight Checks

1. **Confirm Node.js**: Run `node -e "console.log('ok')"  # Node.js >= 18 required

2. **API Key (optional)**: For higher rate limits, set:
   ```bash
   export TRONGRID_API_KEY="your-api-key"
   ```

## Skill Routing

- For token metadata / search → use `tron-token`
- For market prices / charts → use `tron-market`
- For DEX swap → use `tron-swap`
- For energy / bandwidth → use `tron-resource`
- For staking / voting → use `tron-staking`

## Resolve the CLI path

Every command below runs `node "$TRON_API"`. Set `$TRON_API` once per session so it works no matter how the skill was installed (Claude Code plugin, `install.sh` → `~/.tronlink-skills`, or inside the cloned repo):

```bash
TRON_API="${CLAUDE_PLUGIN_ROOT:-$HOME/.tronlink-skills}/scripts/tron_api.mjs"
[ -f "$TRON_API" ] || TRON_API="scripts/tron_api.mjs"   # fallback when run inside the repo
```

## Commands

### 1. Check TRX Balance

```bash
node "$TRON_API" wallet-balance --address <TRON_ADDRESS>
```

Returns: TRX balance (human-readable), frozen TRX, account creation time.

### 2. Check TRC-20 Token Balance

```bash
node "$TRON_API" token-balance --address <TRON_ADDRESS> --contract <TOKEN_CONTRACT>
```

Common TRC-20 contracts:
| Token | Contract |
|-------|----------|
| USDT | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |
| USDC | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` |
| WTRX | `TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR` |
| BTT | `TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4` |
| JST | `TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9` |
| SUN | `TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S` |
| WIN | `TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7` |

### 3. Get All TRC-20 Holdings

```bash
node "$TRON_API" wallet-tokens --address <TRON_ADDRESS>
```

Returns: list of all TRC-20 tokens with balances and symbols (known tokens are scaled to the correct decimals). Note: **USD valuation is not included** — pricing every token would need a separate call per token; use `token-price` for a specific token's USD price.

### 4. Transaction History

```bash
node "$TRON_API" tx-history --address <TRON_ADDRESS> --limit 20
```

Returns: recent transactions with type, amount, timestamp, status.

### 5. Account Info

```bash
node "$TRON_API" account-info --address <TRON_ADDRESS>
```

Returns: account creation date, permissions, resource overview, frozen balances, voting info.

### 6. Validate Address

```bash
node "$TRON_API" validate-address --address <ADDRESS>
```

Returns: whether the address is valid TRON Base58Check format.

### 7. TRC-20 Approvals (allowance audit)

```bash
node "$TRON_API" wallet-approvals --address <TRON_ADDRESS> --limit 50
```

Returns: active TRC-20 approvals for the address — token, spender (and project), allowance amount, an **`unlimited` flag**, and the approval date. It also summarizes how many are unlimited.

⚠️ **Unlimited approvals are the main wallet-drain risk**: a compromised or malicious spender contract can move that token at any time. Surface unlimited approvals to the user and suggest revoking unused ones in the TronLink wallet (revoking requires signing, which this read-only skill does not do).

### 8. Wallet Overview (one-shot dashboard)

```bash
node "$TRON_API" wallet-overview --address <TRON_ADDRESS>
```

Returns everything about a wallet in one call: TRX balance, known TRC-20 holdings (correctly scaled — unknown-decimal tokens are counted, not mis-scaled), Energy/Bandwidth resources, and a staking summary (frozen amounts, votes, unclaimed rewards, pending unfreezes). Use this instead of chaining `wallet-balance` + `wallet-tokens` + `resource-info` + `staking-info`.

## Address Format Notes

- TRON addresses start with `T` and are 34 characters long (Base58Check)
- Hex addresses start with `41` and are 42 hex characters
- Example: `TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL`
- The script accepts both formats and auto-converts

## Common Token Contracts (Mainnet)

```
USDT:  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
USDC:  TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8
USDD:  TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz   (USDD 2.0)
WTRX:  TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR
TUSD:  TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4
USDJ:  TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT
BTT:   TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4
JST:   TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9
SUN:   TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S
WIN:   TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7
NFT:   TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq
APENFT: TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq
```

## Troubleshooting

**"Account not found"**: The address has never been activated on TRON. A minimum of 1 TRX must be sent to activate it.

**"Bandwidth insufficient"**: The account has used up its daily free bandwidth (600). Either wait for daily reset, freeze TRX for bandwidth, or the transaction will burn TRX as fee.

**"Energy insufficient for TRC-20"**: Smart contract calls require Energy. Freeze TRX for Energy via `tron-staking`, or TRX will be burned (~3–6.5 TRX for a USDT transfer at the mid-2026 energy fee of ~100 SUN; was ~13–27 TRX at the old 420-SUN rate — check `energy-price` for the live cost).
