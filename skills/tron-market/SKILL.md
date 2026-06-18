---
name: tron-market
description: "This skill should be used when the user asks for 'TRX price', 'TRON token price', 'price chart on TRON', 'K-line data for USDT/TRX', 'TRON trade history', 'TRON whale activity', 'large transfers on TRON', 'smart money on TRON', 'TRON DEX volume', or mentions checking real-time prices, candlestick data, trading volume, whale monitoring, or smart money signals on the TRON network. For token search and metadata, use tron-token. For swap execution, use tron-swap."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.1.0"
  homepage: "https://trongrid.io"
---

# TRON Market Data

8 commands for real-time prices, K-line data, trade history, DEX volume, whale monitoring, large transfer alerts, liquidity pool info, and market overview.

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

### 1. Token Price

```bash
node "$TRON_API" token-price --contract <TOKEN_CONTRACT>
```

Returns: current price in USD and TRX, 24h change, 24h volume, market cap.

For TRX itself:
```bash
node "$TRON_API" token-price --contract TRX
```

### 2. K-line / Candlestick Data

```bash
node "$TRON_API" kline \
  --contract <TOKEN_CONTRACT> \
  --interval <1m|5m|15m|1h|4h|1d|1w> \
  --limit 100
```

Returns: OHLC (Open, High, Low, Close) candles from CoinGecko. Note: **volume is not included**, and `interval` selects a CoinGecko time-range bucket (granularity is auto-chosen by range) rather than exact candle spacing. For precise intervals or volume, use a DEX/Tronscan chart.

### 3. Trade History (TRC-20 transfers)

```bash
node "$TRON_API" trade-history --contract <TOKEN_CONTRACT> --limit 50
```

Returns: recent on-chain **TRC-20 transfers** for the token — txid, timestamp, from/to addresses (with exchange/label tags when TronScan knows them), amount, symbol, and confirmation status. Note: these are **raw token transfers**, not matched DEX trades — there is **no execution price, no buy/sell side, and no DEX/exchange source**. For an indexed trade tape with prices you need a DEX subgraph; use a DEX explorer (SunSwap / Tronscan) for that.

### 4. DEX Volume Statistics

```bash
node "$TRON_API" dex-volume \
  --contract <TOKEN_CONTRACT> \
  --period <5m|1h|4h|24h>
```

Returns: a 24h volume + liquidity snapshot from market data (24h volume in TRX/USD, liquidity, transfer count, price change). Note: `period` is a label only — the figures are always the 24h snapshot. Per-side **buy/sell** volume, trade count, and unique-trader counts are **not** provided (those need a DEX subgraph); use `trade-history` for individual trades.

### 5. Whale Monitoring

```bash
node "$TRON_API" whale-transfers \
  --contract <TOKEN_CONTRACT> \
  --min-value <MIN_TOKEN_AMOUNT>
```

Returns: transfers at/above the threshold with sender, receiver, amount, timestamp — **sorted largest-first**. Note: `--min-value` is a **token amount in whole units** (e.g. `100000` = 100,000 USDT), not a USD value — the script has no price conversion here. Important: TronScan's free API ignores amount-sort and caps a page at 50, so this **scans only the ~50 most recent transfers, not full history** — a whale older than that window won't appear, and an empty list means "none recent met the threshold," not "none exist." For exhaustive whale tracking use a TronScan/DEX explorer.

### 6. Large TRX Transfers

```bash
node "$TRON_API" large-transfers --min-trx 100000 --limit 20
```

Returns: native-TRX transfers at/above `--min-trx`, **sorted largest-first**. Note: TronScan's free API ignores amount-sort and caps a page at 50, so this **scans only the ~50 most recent transactions, not full history**. Most recent transactions are 0-TRX contract calls, so large native-TRX transfers are sparse — an empty list usually means "none occurred recently," not "none exist." Use a block explorer for comprehensive large-transfer tracking.

### 7. Liquidity Pool Info

```bash
node "$TRON_API" pool-info --contract <TOKEN_CONTRACT>
```

Returns a token-level liquidity/volume snapshot from market data: 24h liquidity (USD), 24h volume (USD and TRX), price, price source, and a pair URL if available. Note: this is **not** a per-pool TVL/APY breakdown — use `swap-quote` for actual routing across SunSwap V2/V3 and Sun.io.

### 8. Market Overview

```bash
node "$TRON_API" market-overview
```

Returns: TRON network stats — TRX price (USD) and 24h change, TRX market cap, 24h network volume, latest & confirmed block height, and network env. Note: total-account and total-transaction counters are **not** included (each field falls back to `null` rather than `0` when its upstream source is unavailable).

## DEX Sources on TRON

| DEX | Description |
|-----|-------------|
| SunSwap V2 | Main AMM DEX on TRON |
| SunSwap V3 | Concentrated liquidity (Uni V3 fork) |
| Sun.io | Stablecoin swap (Curve-style) |
| Poloniex DEX | Order book + AMM |
| JustMoney | Aggregator |

## Data Interpretation Tips for Agents

- **Buy/sell ratio > 2.0**: Strong buying pressure, potential pump
- **Whale transfer to exchange**: Potential sell-off signal
- **Whale transfer from exchange**: Potential accumulation
- **Volume spike with stable price**: Possible wash trading
- **New pool creation**: Early opportunity or scam — always check `tron-token security`
