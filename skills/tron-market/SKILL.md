---
name: tron-market
description: "This skill should be used when the user asks for 'TRX price', 'TRON token price', 'price chart on TRON', 'K-line data for USDT/TRX', 'TRON trade history', 'TRON whale activity', 'large transfers on TRON', 'smart money on TRON', 'TRON DEX volume', or mentions checking real-time prices, candlestick data, trading volume, whale monitoring, or smart money signals on the TRON network. For token search and metadata, use tron-token. For swap execution, use tron-swap."
license: MIT
metadata:
  author: tronlink-skills
  version: "1.0.0"
  homepage: "https://trongrid.io"
---

# TRON Market Data

8 commands for real-time prices, K-line data, trade history, DEX volume, whale monitoring, large transfer alerts, liquidity pool info, and market overview.

## Pre-flight Checks

1. **Confirm Python & dependencies**:
   ```bash
   node -e "console.log('ok')"  # Node.js >= 18 required
   ```

## Commands

### 1. Token Price

```bash
node scripts/tron_api.mjs token-price --contract <TOKEN_CONTRACT>
```

Returns: current price in USD and TRX, 24h change, 24h volume, market cap.

For TRX itself:
```bash
node scripts/tron_api.mjs token-price --contract TRX
```

### 2. K-line / Candlestick Data

```bash
node scripts/tron_api.mjs kline \
  --contract <TOKEN_CONTRACT> \
  --interval <1m|5m|15m|1h|4h|1d|1w> \
  --limit 100
```

Returns: OHLCV (Open, High, Low, Close, Volume) data points.

### 3. Trade History

```bash
node scripts/tron_api.mjs trade-history --contract <TOKEN_CONTRACT> --limit 50
```

Returns: recent DEX trades with price, amount, buyer/seller, timestamp, DEX source.

### 4. DEX Volume Statistics

```bash
node scripts/tron_api.mjs dex-volume \
  --contract <TOKEN_CONTRACT> \
  --period <5m|1h|4h|24h>
```

Returns: buy/sell volume, trade count, unique traders, buy/sell ratio.

### 5. Whale Monitoring

```bash
node scripts/tron_api.mjs whale-transfers \
  --contract <TOKEN_CONTRACT> \
  --min-value <MIN_USD_VALUE>
```

Returns: large transfers over the threshold with sender, receiver, amount, timestamp.

### 6. Large TRX Transfers

```bash
node scripts/tron_api.mjs large-transfers --min-trx 100000 --limit 20
```

Returns: recent large TRX movements across the network.

### 7. Liquidity Pool Info

```bash
node scripts/tron_api.mjs pool-info --contract <TOKEN_CONTRACT>
```

Returns: LP pools on SunSwap V2/V3, liquidity depth, TVL, APY, pair token.

### 8. Market Overview

```bash
node scripts/tron_api.mjs market-overview
```

Returns: TRON network stats — TRX price, total market cap, 24h network volume, active accounts, total transactions, latest block.

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
