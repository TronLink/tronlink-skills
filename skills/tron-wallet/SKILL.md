---
name: tron-wallet
description: "This skill should be used when the user asks to 'check my TRX balance', 'show my TRON holdings', 'what tokens do I have on TRON', 'check my TRON wallet', 'TronLink balance', 'view my TRC-20 tokens', 'TRON transaction history', 'account info on TRON', or mentions checking wallet balance, viewing transaction history, or managing a TronLink wallet. Do NOT use for swap/trading — use tron-swap instead. Do NOT use for staking — use tron-staking instead."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.0.0"
  homepage: "https://trongrid.io"
---

# TRON Wallet Management

6 commands for wallet balance, TRC-20 holdings, transaction history, account info, address validation, and multi-sig support.

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

## Commands

### 1. Check TRX Balance

```bash
node scripts/tron_api.mjs wallet-balance --address <TRON_ADDRESS>
```

Returns: TRX balance (human-readable), frozen TRX, account creation time.

### 2. Check TRC-20 Token Balance

```bash
node scripts/tron_api.mjs token-balance --address <TRON_ADDRESS> --contract <TOKEN_CONTRACT>
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
node scripts/tron_api.mjs wallet-tokens --address <TRON_ADDRESS>
```

Returns: list of all TRC-20 tokens with balances, symbols, and USD values.

### 4. Transaction History

```bash
node scripts/tron_api.mjs tx-history --address <TRON_ADDRESS> --limit 20
```

Returns: recent transactions with type, amount, timestamp, status.

### 5. Account Info

```bash
node scripts/tron_api.mjs account-info --address <TRON_ADDRESS>
```

Returns: account creation date, permissions, resource overview, frozen balances, voting info.

### 6. Validate Address

```bash
node scripts/tron_api.mjs validate-address --address <ADDRESS>
```

Returns: whether the address is valid TRON Base58Check format.

## Address Format Notes

- TRON addresses start with `T` and are 34 characters long (Base58Check)
- Hex addresses start with `41` and are 42 hex characters
- Example: `TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL`
- The script accepts both formats and auto-converts

## Common Token Contracts (Mainnet)

```
USDT:  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
USDC:  TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8
WTRX:  TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR
TUSD:  TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4
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

**"Energy insufficient for TRC-20"**: Smart contract calls require Energy. Freeze TRX for Energy via `tron-staking`, or TRX will be burned (often 13-27 TRX for a USDT transfer).
