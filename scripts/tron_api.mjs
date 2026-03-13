#!/usr/bin/env node

/**
 * tron_api.mjs — Node.js CLI tool for TronLink Wallet Skills
 *
 * Provides wallet management, token queries, market data, DEX swap,
 * resource (Energy/Bandwidth) management, and TRX staking on the TRON network.
 *
 * Requirements: Node.js >= 18 (uses native fetch)
 *
 * Usage: node tron_api.mjs <command> [options]
 */

import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || "";
const TRONSCAN_API_KEY = process.env.TRONSCAN_API_KEY || "";
const TRON_NETWORKS = {
  mainnet: "https://api.trongrid.io",
  shasta: "https://api.shasta.trongrid.io",
  nile: "https://nile.trongrid.io",
};
const NETWORK = process.env.TRON_NETWORK || "mainnet";
const BASE_URL = TRON_NETWORKS[NETWORK] || TRON_NETWORKS.mainnet;
const TRONSCAN_API = "https://apilist.tronscanapi.com/api";
const SUN_PER_TRX = 1_000_000;

// Sun.io Smart Router API — official backend endpoints extracted from sun.io frontend bundle.
// Domain `endjgfsv.link` is Sun.io's CDN; no public api.sun.io/swap/router exists.
// See: https://docs.sun.io/developers/swap/smart-router
const SUNIO_ROUTER_API = {
  mainnet: "https://rot.endjgfsv.link",
  nile:    "https://tnrouter.endjgfsv.link",
};
const SWAP_ROUTER_BASE = SUNIO_ROUTER_API[NETWORK] || SUNIO_ROUTER_API.mainnet;

// CoinGecko free API — used as fallback for market data when TronScan endpoints are unavailable
const COINGECKO_API = "https://api.coingecko.com/api/v3";


const KNOWN_TOKENS = {
  TRX:  { contract: "TRX", symbol: "TRX",  decimals: 6,  name: "TRON" },
  USDT: { contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", symbol: "USDT", decimals: 6,  name: "Tether USD" },
  USDC: { contract: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", symbol: "USDC", decimals: 6,  name: "USD Coin" },
  WTRX: { contract: "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR", symbol: "WTRX", decimals: 6,  name: "Wrapped TRX" },
  BTT:  { contract: "TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4", symbol: "BTT",  decimals: 18, name: "BitTorrent" },
  JST:  { contract: "TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9", symbol: "JST",  decimals: 18, name: "JUST" },
  SUN:  { contract: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S", symbol: "SUN",  decimals: 18, name: "SUN Token" },
  WIN:  { contract: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", symbol: "WIN",  decimals: 6,  name: "WINkLink" },
};

// ---------------------------------------------------------------------------
// HTTP Helpers
// ---------------------------------------------------------------------------

function headers(url = "") {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  // Only add TRON-PRO-API-KEY for TronGrid requests, not for TronScan
  if (TRONGRID_API_KEY && !url.includes("tronscanapi.com")) {
    h["TRON-PRO-API-KEY"] = TRONGRID_API_KEY;
  }
  return h;
}

async function httpGet(url, params = {}) {
  try {
    // Add TRONSCAN API Key for tronscan API requests (as URL parameter)
    if (url.includes("tronscanapi.com") && TRONSCAN_API_KEY) {
      params.apikey = TRONSCAN_API_KEY;
    }
    const qs = new URLSearchParams(params).toString();
    const fullUrl = qs ? `${url}?${qs}` : url;
    const reqHeaders = headers(url);  // Pass URL to headers() to avoid mixing API keys
    const resp = await fetch(fullUrl, { headers: reqHeaders, signal: AbortSignal.timeout(15000) });
    const data = await resp.json();
    return data;
  } catch (e) {
    return { error: e.message };
  }
}

async function httpPost(url, body = {}) {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: headers(url),  // Pass URL to headers()
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return await resp.json();
  } catch (e) {
    return { error: e.message };
  }
}

function fmt(data) {
  return JSON.stringify(data, null, 2);
}

function sunToTrx(sun) { return sun / SUN_PER_TRX; }
function trxToSun(trx) { return Math.round(trx * SUN_PER_TRX); }

// ---------------------------------------------------------------------------
// Base58Check Address Utilities (zero-dependency)
// ---------------------------------------------------------------------------

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58decode(str) {
  let n = 0n;
  for (const ch of str) {
    const idx = B58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid Base58 char: ${ch}`);
    n = n * 58n + BigInt(idx);
  }
  // Convert bigint to Buffer
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const bytes = Buffer.from(hex, "hex");
  // Count leading '1's
  let pad = 0;
  for (const ch of str) { if (ch === "1") pad++; else break; }
  return Buffer.concat([Buffer.alloc(pad), bytes]);
}

function b58encode(buf) {
  let n = 0n;
  for (const byte of buf) n = n * 256n + BigInt(byte);
  const result = [];
  while (n > 0n) {
    const [q, r] = [n / 58n, n % 58n];
    result.push(B58_ALPHABET[Number(r)]);
    n = q;
  }
  // Leading zeros
  for (const byte of buf) { if (byte === 0) result.push("1"); else break; }
  return result.reverse().join("");
}

function sha256(data) {
  return createHash("sha256").update(data).digest();
}

function isValidTronAddress(address) {
  if (!address || address.length !== 34 || !address.startsWith("T")) return false;
  try {
    const decoded = b58decode(address);
    if (decoded.length !== 25) return false;
    const payload = decoded.subarray(0, -4);
    const checksum = decoded.subarray(-4);
    const hash = sha256(sha256(payload));
    return hash.subarray(0, 4).equals(checksum);
  } catch {
    return false;
  }
}

function hexToBase58(hexAddr) {
  if (hexAddr.startsWith("0x")) hexAddr = "41" + hexAddr.slice(2);
  const addrBuf = Buffer.from(hexAddr, "hex");
  const hash = sha256(sha256(addrBuf));
  return b58encode(Buffer.concat([addrBuf, hash.subarray(0, 4)]));
}

function normalizeAddress(addr) {
  if (addr.startsWith("41") && addr.length === 42) return hexToBase58(addr);
  if (addr.startsWith("0x") && addr.length === 42) return hexToBase58(addr);
  return addr;
}

function resolveToken(input) {
  const upper = input.toUpperCase();
  if (KNOWN_TOKENS[upper]) return KNOWN_TOKENS[upper];
  return { contract: input, symbol: input.slice(0, 8), decimals: 6, name: "Unknown" };
}

// ---------------------------------------------------------------------------
// Wallet Commands
// ---------------------------------------------------------------------------

async function cmdWalletBalance({ address }) {
  address = normalizeAddress(address);
  const data = await httpGet(`${BASE_URL}/v1/accounts/${address}`);
  if (data.error) return console.log(fmt(data));
  if (!data.data?.length) return console.log(fmt({ error: "Account not found. Needs at least 1 TRX to activate." }));

  const acct = data.data[0];
  const frozenV2 = acct.frozenV2 || [];
  const frozenEnergy = frozenV2.filter(f => f.type === "ENERGY").reduce((s, f) => s + (f.amount || 0), 0);
  const frozenBW = frozenV2.filter(f => f.type !== "ENERGY").reduce((s, f) => s + (f.amount || 0), 0);

  console.log(fmt({
    address,
    balance_trx: sunToTrx(acct.balance || 0),
    balance_sun: acct.balance || 0,
    frozen_for_energy_trx: sunToTrx(frozenEnergy),
    frozen_for_bandwidth_trx: sunToTrx(frozenBW),
    create_time: acct.create_time ? new Date(acct.create_time).toISOString() : null,
    network: NETWORK,
  }));
}

async function cmdTokenBalance({ address, contract }) {
  address = normalizeAddress(address);
  const tokenInfo = resolveToken(contract);
  contract = tokenInfo.contract;

  const data = await httpGet(`${BASE_URL}/v1/accounts/${address}`);
  if (data.error || !data.data?.length) return console.log(fmt({ error: "Account not found" }));

  const trc20 = data.data[0].trc20 || [];
  let balance = 0;
  for (const tokenMap of trc20) {
    if (tokenMap[contract]) { balance = parseInt(tokenMap[contract]); break; }
  }

  console.log(fmt({
    address,
    token_contract: contract,
    symbol: tokenInfo.symbol,
    balance_raw: balance,
    balance: balance / (10 ** tokenInfo.decimals),
    decimals: tokenInfo.decimals,
  }));
}

async function cmdWalletTokens({ address }) {
  address = normalizeAddress(address);
  const data = await httpGet(`${BASE_URL}/v1/accounts/${address}`);
  if (data.error || !data.data?.length) return console.log(fmt({ error: "Account not found" }));

  const acct = data.data[0];
  const holdings = [];

  for (const tokenMap of (acct.trc20 || [])) {
    for (const [addr, rawBal] of Object.entries(tokenMap)) {
      const bal = parseInt(rawBal);
      let symbol = addr.slice(0, 8) + "...", decimals = 6, name = "Unknown";
      for (const v of Object.values(KNOWN_TOKENS)) {
        if (v.contract === addr) { symbol = v.symbol; decimals = v.decimals; name = v.name; break; }
      }
      const humanBal = bal / (10 ** decimals);
      if (humanBal > 0) holdings.push({ symbol, name, contract: addr, balance: humanBal });
    }
  }

  console.log(fmt({
    address,
    trx_balance: sunToTrx(acct.balance || 0),
    trc20_tokens: holdings,
    token_count: holdings.length,
  }));
}

async function cmdTxHistory({ address, limit = 20 }) {
  address = normalizeAddress(address);
  const data = await httpGet(`${BASE_URL}/v1/accounts/${address}/transactions`, {
    limit, order_by: "block_timestamp,desc",
  });
  if (data.error) return console.log(fmt(data));

  const txs = (data.data || []).map(tx => {
    const raw = tx.raw_data || {};
    const c = (raw.contract || [{}])[0];
    const val = c.parameter?.value || {};
    return {
      txid: tx.txID || "",
      type: c.type || "Unknown",
      block_timestamp: tx.block_timestamp ? new Date(tx.block_timestamp).toISOString() : null,
      result: (tx.ret || [{}])[0].contractRet || "",
      amount_sun: val.amount || 0,
      amount_trx: val.amount ? sunToTrx(val.amount) : null,
      to: val.to_address ? normalizeAddress(val.to_address) : null,
    };
  });

  console.log(fmt({ address, transactions: txs, count: txs.length }));
}

async function cmdAccountInfo({ address }) {
  address = normalizeAddress(address);
  const data = await httpGet(`${BASE_URL}/v1/accounts/${address}`);
  if (data.error || !data.data?.length) return console.log(fmt({ error: "Account not found" }));

  const acct = data.data[0];
  const resource = await httpPost(`${BASE_URL}/wallet/getaccountresource`, { address, visible: true });

  console.log(fmt({
    address,
    balance_trx: sunToTrx(acct.balance || 0),
    create_time: acct.create_time ? new Date(acct.create_time).toISOString() : null,
    is_witness: acct.is_witness || false,
    frozen_v2: acct.frozenV2 || [],
    unfrozen_v2: acct.unfrozenV2 || [],
    votes: acct.votes || [],
    tron_power: acct.tron_power || {},
    resource_overview: {
      free_bandwidth_limit: resource.freeNetLimit || 600,
      free_bandwidth_used: resource.freeNetUsed || 0,
      staked_bandwidth_limit: resource.NetLimit || 0,
      staked_bandwidth_used: resource.NetUsed || 0,
      energy_limit: resource.EnergyLimit || 0,
      energy_used: resource.EnergyUsed || 0,
    },
    network: NETWORK,
  }));
}

async function cmdValidateAddress({ address }) {
  const data = await httpPost(`${BASE_URL}/wallet/validateaddress`, { address });
  const valid = data.error ? isValidTronAddress(address) : (data.result || false);
  console.log(fmt({
    address,
    valid,
    format: address.startsWith("T") ? "Base58Check" : "Hex",
    normalized: valid ? normalizeAddress(address) : null,
  }));
}

// ---------------------------------------------------------------------------
// Token Commands
// ---------------------------------------------------------------------------

async function cmdTokenInfo({ contract }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  const scanData = await httpGet(`${TRONSCAN_API}/token_trc20`, { contract });
  
  // Debug: check if API returned data
  if (scanData.error) {
    return console.log(fmt({
      error: scanData.error,
      contract,
      hint: "API request failed"
    }));
  }
  
  const token = scanData.trc20_tokens?.[0] || {};
  
  // If no token data, scanData might be empty
  if (!token.symbol) {
    return console.log(fmt({
      contract,
      error: "Token not found in TronScan API",
      api_response_keys: Object.keys(scanData),
      token_count: (scanData.trc20_tokens || []).length
    }));
  }

  const mi = token.market_info || {};
  console.log(fmt({
    contract,
    name: token.name || token.symbol || "Unknown",
    symbol: token.symbol || "Unknown",
    decimals: token.decimals || 0,
    total_supply: token.total_supply_with_decimals || "0",
    holders: token.holders_count || 0,
    transfers: token.transfer_num || 0,
    market_cap_usd: token.market_cap_usd || 0,
    price_usd: mi.priceInUsd || token.price || 0,
    icon_url: token.icon_url || "",
    home_page: token.home_page || "",
    issue_time: token.issue_time || "",
    issuer_addr: token.issue_address || "",
  }));
}

async function cmdTokenSearch({ keyword }) {
  // TronScan search API: use 'term' parameter to find tokens
  const results = await httpGet(`${TRONSCAN_API}/search`, { term: keyword });
  const items = Array.isArray(results) ? results : [];

  // Extract TRC-20 tokens and parse contract address from value string
  const trc20Items = items
    .filter(r => r.desc === "Token-TRC20")
    .map(r => {
      // value format: "TokenName(SYMBOL) ContractAddress"
      const m = r.value?.match(/^(.+?)\((.+?)\)\s+(\w+)$/);
      return m ? { name: m[1], symbol: m[2], contract: m[3] } : null;
    })
    .filter(Boolean)
    .slice(0, 20);

  // Enrich top results with on-chain data (batch up to 5 for speed)
  const enriched = await Promise.all(
    trc20Items.slice(0, 10).map(async (t) => {
      const data = await httpGet(`${TRONSCAN_API}/token_trc20`, { contract: t.contract });
      const token = data.trc20_tokens?.[0];
      const mi = token?.market_info || {};
      return {
        name: token?.name || t.name,
        symbol: token?.symbol || t.symbol,
        contract: t.contract,
        holders: token?.holders_count || 0,
        price_usd: mi.priceInUsd || token?.price || 0,
        market_cap: token?.market_cap_usd || 0,
      };
    })
  );

  console.log(fmt({ query: keyword, results: enriched, count: enriched.length }));
}

async function cmdContractInfo({ contract }) {
  const data = await httpGet(`${TRONSCAN_API}/contract`, { contract });
  const c = data.data?.[0] || {};
  console.log(fmt({
    contract,
    name: c.name || "Unknown",
    verified: c.verify_status || 0,
    creator: c.creator?.address || "",
    creation_time: c.date_created || "",
    energy_factor: c.consume_user_resource_percent || 0,
  }));
}

async function cmdTokenHolders({ contract, limit = 20 }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  const data = await httpGet(`${TRONSCAN_API}/token_trc20/holders`, {
    contract_address: contract, limit, start: 0,
  });
  const totalSupply = data.rangeTotal || 0;
  const holders = (data.trc20_tokens || []).map(h => {
    const bal = parseFloat(h.balance || 0);
    return {
      address: h.holder_address || "",
      address_tag: h.addressTag || "",
      balance: bal,
      percentage: totalSupply > 0 ? ((bal / totalSupply) * 100).toFixed(4) + "%" : "N/A",
    };
  });
  console.log(fmt({ contract, holders, total_holders: totalSupply, count: holders.length }));
}

async function cmdTrendingTokens() {
  const data = await httpGet(`${COINGECKO_API}/coins/markets`, {
    vs_currency: "usd", category: "tron-ecosystem",
    order: "volume_desc", per_page: 20, page: 1,
  });
  if (data.error || !Array.isArray(data)) {
    return console.log(fmt({ error: "Failed to fetch trending tokens", detail: data.error || data }));
  }
  const tokens = data.map(t => ({
    name: t.name, symbol: (t.symbol || "").toUpperCase(),
    coingecko_id: t.id,
    price_usd: t.current_price || 0,
    volume_24h: t.total_volume || 0,
    market_cap: t.market_cap || 0,
    change_24h: t.price_change_percentage_24h || 0,
  }));
  console.log(fmt({ trending_tokens: tokens, count: tokens.length, source: "CoinGecko (TRON ecosystem)" }));
}

async function cmdTokenRankings({ sortBy = "market_cap" }) {
  const cgOrder = {
    market_cap: "market_cap_desc", volume: "volume_desc",
    holders: "market_cap_desc", gainers: "market_cap_desc", losers: "market_cap_desc",
  };
  const data = await httpGet(`${COINGECKO_API}/coins/markets`, {
    vs_currency: "usd", category: "tron-ecosystem",
    order: cgOrder[sortBy] || "market_cap_desc", per_page: 20, page: 1,
  });
  if (data.error || !Array.isArray(data)) {
    return console.log(fmt({ error: "Failed to fetch token rankings", detail: data.error || data }));
  }
  let tokens = data.map(t => ({
    name: t.name, symbol: (t.symbol || "").toUpperCase(),
    coingecko_id: t.id,
    price_usd: t.current_price || 0,
    market_cap: t.market_cap || 0,
    volume_24h: t.total_volume || 0,
    change_24h: t.price_change_percentage_24h || 0,
  }));
  // Client-side sort for gainers/losers
  if (sortBy === "gainers") tokens.sort((a, b) => b.change_24h - a.change_24h);
  if (sortBy === "losers") tokens.sort((a, b) => a.change_24h - b.change_24h);
  tokens = tokens.map((t, i) => ({ rank: i + 1, ...t }));
  console.log(fmt({ sort_by: sortBy, tokens, source: "CoinGecko (TRON ecosystem)" }));
}

async function cmdTokenSecurity({ contract }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  const [contractData, holderData, tokenData] = await Promise.all([
    httpGet(`${TRONSCAN_API}/contract`, { contract }),
    httpGet(`${TRONSCAN_API}/token_trc20/holders`, { contract_address: contract, limit: 10, start: 0 }),
    httpGet(`${TRONSCAN_API}/token_trc20`, { contract }),
  ]);

  const c = contractData.data?.[0] || {};
  const t = tokenData.trc20_tokens?.[0] || {};
  const mi = t.market_info || {};
  const totalHolders = holderData.rangeTotal || t.holders_count || 0;
  const topHolders = holderData.trc20_tokens || [];

  // Calculate top-5 holder concentration using raw balances and total supply
  const totalSupplyRaw = parseFloat(t.total_supply_with_decimals || 0);
  const top5Balance = topHolders.slice(0, 5).reduce((s, h) => s + parseFloat(h.balance || 0), 0);
  const top5Pct = totalSupplyRaw > 0 ? (top5Balance / totalSupplyRaw) * 100 : 0;

  console.log(fmt({
    contract,
    name: t.name || "Unknown",
    symbol: t.symbol || "Unknown",
    security_checks: {
      is_verified: Boolean(c.verify_status),
      creator: c.creator?.address || "Unknown",
      creation_date: c.date_created ? new Date(c.date_created).toISOString() : "Unknown",
      top5_holder_concentration_pct: Math.round(top5Pct * 100) / 100,
      holder_count: totalHolders,
      total_transfers: t.transfer_num || 0,
    },
    risk_assessment: {
      concentration_risk: top5Pct > 80 ? "HIGH" : top5Pct > 50 ? "MEDIUM" : "LOW",
      verified_source: c.verify_status ? "PASS" : "FAIL — source not verified",
      holder_risk: totalHolders < 100 ? "HIGH" : "LOW",
      liquidity: mi.volume24hInTrx || t.volume24h || 0,
    },
    recommendation:
      top5Pct > 80 || !c.verify_status || totalHolders < 100
        ? "⚠️ CAUTION" : "✅ Appears relatively safe — always DYOR",
  }));
}

// ---------------------------------------------------------------------------
// Market Commands
// ---------------------------------------------------------------------------

async function cmdTokenPrice({ contract }) {
  if (contract.toUpperCase() === "TRX") {
    const data = await httpGet(`${COINGECKO_API}/simple/price`, {
      ids: "tron", vs_currencies: "usd",
      include_24hr_vol: true, include_24hr_change: true, include_market_cap: true,
    });
    const trx = data.tron || {};
    return console.log(fmt({
      token: "TRX",
      price_usd: trx.usd || 0,
      volume_24h_usd: trx.usd_24h_vol || 0,
      market_cap_usd: trx.usd_market_cap || 0,
      change_24h_pct: trx.usd_24h_change || 0,
      network: "TRON",
    }));
  }

  const resolved = resolveToken(contract);
  contract = resolved.contract;

  const data = await httpGet(`${TRONSCAN_API}/token_trc20`, { contract });
  const token = data.trc20_tokens?.[0] || {};
  const mi = token.market_info || {};

  console.log(fmt({
    contract,
    symbol: token.symbol || "Unknown",
    price_usd: mi.priceInUsd || token.price || 0,
    price_in_trx: mi.priceInTrx || 0,
    volume_24h_trx: mi.volume24hInTrx || 0,
    market_cap: token.market_cap_usd || 0,
    change_24h_pct: mi.gain || 0,
  }));
}

async function cmdKline({ contract, interval = "1h", limit = 100 }) {
  const resolved = resolveToken(contract);

  // Map interval to CoinGecko days parameter
  const intervalToDays = { "1m": 1, "5m": 1, "15m": 1, "1h": 1, "4h": 7, "1d": 30, "1w": 180 };
  const days = intervalToDays[interval] || 1;

  // Resolve CoinGecko coin ID
  let cgId;
  if (resolved.contract === "TRX" || resolved.symbol === "TRX") {
    cgId = "tron";
  } else {
    // Look up CoinGecko ID via contract address
    const lookup = await httpGet(`${COINGECKO_API}/coins/tron/contract/${resolved.contract}`);
    cgId = lookup.id;
  }

  if (!cgId) {
    return console.log(fmt({
      info: "Token not found on CoinGecko for K-line data.",
      suggestion: "Use TronScan or SunSwap for detailed chart data.",
      tronscan_url: `https://tronscan.org/#/token20/${resolved.contract}`,
    }));
  }

  const data = await httpGet(`${COINGECKO_API}/coins/${cgId}/ohlc`, {
    vs_currency: "usd", days,
  });

  if (!Array.isArray(data) || data.length === 0) {
    return console.log(fmt({
      info: "K-line data unavailable for this token.",
      tronscan_url: `https://tronscan.org/#/token20/${resolved.contract}`,
    }));
  }

  const candles = data.slice(-limit).map(c => ({
    timestamp: new Date(c[0]).toISOString(),
    open: c[1], high: c[2], low: c[3], close: c[4],
  }));
  console.log(fmt({ contract: resolved.contract, symbol: resolved.symbol, interval, candles, source: "CoinGecko" }));
}

async function cmdTradeHistory({ contract, limit = 50 }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  const data = await httpGet(`${TRONSCAN_API}/token_trc20/transfers`, {
    contract_address: contract, limit, start: 0, sort: "-timestamp",
  });
  const transfers = (data.token_transfers || []).map(t => {
    const decimals = parseInt(t.tokenInfo?.tokenDecimal || 6);
    const amount = parseFloat(t.quant || 0) / (10 ** decimals);
    return {
      txid: t.transaction_id || "",
      timestamp: t.block_ts ? new Date(t.block_ts).toISOString() : "",
      from: t.from_address || "",
      from_tag: t.from_address_tag?.from_address_tag || "",
      to: t.to_address || "",
      to_tag: t.to_address_tag?.to_address_tag || "",
      amount,
      symbol: t.tokenInfo?.tokenAbbr || resolved.symbol,
      confirmed: t.confirmed || false,
    };
  });
  console.log(fmt({ contract, transfers, count: transfers.length }));
}

async function cmdDexVolume({ contract, period = "24h" }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  const data = await httpGet(`${TRONSCAN_API}/token_trc20`, { contract });
  const token = data.trc20_tokens?.[0] || {};
  const mi = token.market_info || {};

  console.log(fmt({
    contract,
    symbol: token.symbol || "Unknown",
    period,
    volume_24h_trx: mi.volume24hInTrx || 0,
    volume_24h_usd: token.volume24h || 0,
    liquidity_usd: token.liquidity24h || 0,
    transfers_24h: token.transfer24h || 0,
    price_change: mi.gain || 0,
  }));
}

async function cmdWhaleTransfers({ contract, minValue = 100000 }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  const data = await httpGet(`${TRONSCAN_API}/token_trc20/transfers`, {
    contract_address: contract, limit: 50, start: 0, sort: "-quant",
  });

  const transfers = (data.token_transfers || [])
    .map(t => {
      const decimals = parseInt(t.tokenInfo?.tokenDecimal || 6);
      const amount = parseFloat(t.quant || 0) / (10 ** decimals);
      return {
        txid: t.transaction_id || "", from: t.from_address || "",
        to: t.to_address || "", amount,
        timestamp: t.block_ts || "",
        symbol: t.tokenInfo?.tokenAbbr || "",
      };
    })
    .filter(t => t.amount >= minValue / 100)
    .slice(0, 20);

  console.log(fmt({ contract, min_value_filter: minValue, large_transfers: transfers, count: transfers.length }));
}

async function cmdLargeTransfers({ minTrx = 100000, limit = 20 }) {
  const data = await httpGet(`${TRONSCAN_API}/transaction`, { sort: "-amount", limit, start: 0 });
  const transfers = (data.data || [])
    .map(tx => ({
      txid: tx.hash || "", from: tx.ownerAddress || "",
      to: tx.toAddress || "", amount_trx: sunToTrx(tx.amount || 0),
      timestamp: tx.timestamp || "", confirmed: tx.confirmed || false,
    }))
    .filter(t => t.amount_trx >= minTrx);
  console.log(fmt({ min_trx: minTrx, transfers }));
}

async function cmdPoolInfo({ contract }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  // Use token_trc20 market_info for liquidity data since defi/pools is no longer available
  const data = await httpGet(`${TRONSCAN_API}/token_trc20`, { contract });
  const token = data.trc20_tokens?.[0] || {};
  const mi = token.market_info || {};

  console.log(fmt({
    contract,
    symbol: token.symbol || "Unknown",
    liquidity_usd: token.liquidity24h || 0,
    volume_24h_usd: token.volume24h || 0,
    volume_24h_trx: mi.volume24hInTrx || 0,
    price_usd: mi.priceInUsd || 0,
    price_source: mi.priceFrom || "Unknown",
    pair_url: mi.pairUrl || "",
    dex_sources: "SunSwap V2, V3, Sun.io Curve",
    note: "Use swap-quote for specific pool routing details.",
  }));
}

async function cmdMarketOverview() {
  const [sysData, priceData] = await Promise.all([
    httpGet(`${TRONSCAN_API}/system/status`),
    httpGet(`${COINGECKO_API}/simple/price`, {
      ids: "tron", vs_currencies: "usd",
      include_24hr_vol: true, include_24hr_change: true, include_market_cap: true,
    }),
  ]);
  const trx = priceData.tron || {};
  console.log(fmt({
    tron_network: {
      trx_price_usd: trx.usd || 0,
      trx_24h_change: trx.usd_24h_change || 0,
      trx_market_cap: trx.usd_market_cap || 0,
      trx_24h_volume: trx.usd_24h_vol || 0,
      latest_block: sysData.database?.block || sysData.full?.block || 0,
      confirmed_block: sysData.database?.confirmedBlock || sysData.solidity?.block || 0,
      network_env: sysData.network?.env || "unknown",
    },
  }));
}

// ---------------------------------------------------------------------------
// Swap Commands
// ---------------------------------------------------------------------------

async function cmdSwapQuote({ fromToken, toToken, amount }) {
  const fromInfo = resolveToken(fromToken);
  const toInfo = resolveToken(toToken);
  const amountRaw = Math.round(parseFloat(amount) * (10 ** fromInfo.decimals));

  // Sun.io Smart Router requires WTRX address instead of native TRX
  const WTRX_ADDRESS = KNOWN_TOKENS.WTRX?.contract || "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR";
  const fromAddr = fromInfo.contract === "TRX" ? WTRX_ADDRESS : fromInfo.contract;

  const data = await httpGet(`${SWAP_ROUTER_BASE}/swap/router`, {
    fromToken: fromAddr, toToken: toInfo.contract,
    amountIn: String(amountRaw),
    typeList: "PSM,CURVE,WTRX,SUNSWAP_V2,SUNSWAP_V3",
  });

  if (data.error || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
    return console.log(fmt({
      from: fromToken, to: toToken, amount_in: parseFloat(amount),
      status: "Quote API unavailable — try SunSwap directly",
      sunswap_url: "https://sunswap.com",
      estimated_energy: "65,000-200,000 (depends on route complexity)",
      estimated_trx_burn: "13-40 TRX (if no staked energy)",
    }));
  }

  // API returns an array of routes sorted by best output; take the first (best) route
  const best = data.data[0];

  console.log(fmt({
    from: fromToken, to: toToken,
    amount_in: parseFloat(amount),
    amount_out: parseFloat(best.amountOut || 0),
    price_impact: best.impact || "N/A",
    fee_pct: best.fee || "N/A",
    path: best.symbols || [],
    pool_versions: best.poolVersions || [],
    routes_available: data.data.length,
    estimated_energy: "65,000-200,000",
    dex_sources: "SunSwap V2, V3, Sun.io Curve, PSM",
  }));
}


async function cmdTxStatus({ txid }) {
  // Use full-node API to get transaction and its on-chain receipt
  const [txData, infoData] = await Promise.all([
    httpPost(`${BASE_URL}/wallet/gettransactionbyid`, { value: txid }),
    httpPost(`${BASE_URL}/wallet/gettransactioninfobyid`, { value: txid }),
  ]);

  if (txData.error || !txData.txID) return console.log(fmt({ error: `Transaction ${txid} not found` }));

  const receipt = infoData.receipt || {};

  console.log(fmt({
    txid,
    status: (txData.ret || [{}])[0].contractRet || "UNKNOWN",
    block_number: infoData.blockNumber || 0,
    timestamp: infoData.blockTimeStamp ? new Date(infoData.blockTimeStamp).toISOString() : null,
    energy_used: receipt.energy_usage_total || 0,
    bandwidth_used: receipt.net_usage || infoData.receipt?.net_usage || 0,
    energy_fee_sun: receipt.energy_fee || 0,
    net_fee_sun: receipt.net_fee || infoData.fee || 0,
    tronscan_url: `https://tronscan.org/#/transaction/${txid}`,
  }));
}

// ---------------------------------------------------------------------------
// Resource Commands
// ---------------------------------------------------------------------------

async function cmdResourceInfo({ address }) {
  address = normalizeAddress(address);
  const data = await httpPost(`${BASE_URL}/wallet/getaccountresource`, { address, visible: true });
  if (data.error) return console.log(fmt(data));

  const freeBwLimit = data.freeNetLimit || 600;
  const freeBwUsed = data.freeNetUsed || 0;
  const stakedBwLimit = data.NetLimit || 0;
  const stakedBwUsed = data.NetUsed || 0;
  const energyLimit = data.EnergyLimit || 0;
  const energyUsed = data.EnergyUsed || 0;

  console.log(fmt({
    address,
    bandwidth: {
      free_remaining: freeBwLimit - freeBwUsed,
      free_total: freeBwLimit,
      free_used: freeBwUsed,
      staked_remaining: stakedBwLimit - stakedBwUsed,
      staked_total: stakedBwLimit,
      staked_used: stakedBwUsed,
    },
    energy: {
      remaining: energyLimit - energyUsed,
      total: energyLimit,
      used: energyUsed,
    },
    tips: {
      free_bandwidth_covers: `~${Math.floor((freeBwLimit - freeBwUsed) / 267)} basic TRX transfers`,
      energy_covers: energyLimit > 0
        ? `~${Math.floor((energyLimit - energyUsed) / 65000)} USDT transfers`
        : "0 — no staked energy, TRX will be burned for smart contract calls",
    },
  }));
}

async function cmdEstimateEnergy({ contract, func, params = "", caller }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  const data = await httpPost(`${BASE_URL}/wallet/triggerconstantcontract`, {
    owner_address: caller,
    contract_address: contract,
    function_selector: func,
    parameter: params,
    visible: true,
  });

  const energy = data.energy_used || 0;
  const energyPriceSun = 420;
  const trxCost = (energy * energyPriceSun) / SUN_PER_TRX;

  console.log(fmt({
    contract, function: func,
    estimated_energy: energy,
    estimated_trx_burn: Math.round(trxCost * 100) / 100,
    note: "TRX burn only applies if you have no staked energy. Freeze TRX to avoid burning.",
    result: data.constant_result || [],
  }));
}

async function cmdEstimateBandwidth({ txSize = 267 }) {
  const freeBw = 600;
  console.log(fmt({
    estimated_bandwidth: txSize,
    free_daily_allowance: freeBw,
    covered_by_free: txSize <= freeBw,
    trx_burn_if_insufficient: Math.round(txSize * 1000 / SUN_PER_TRX * 10000) / 10000,
  }));
}

async function cmdEnergyPrice() {
  const params = await httpGet(`${BASE_URL}/wallet/getchainparameters`);
  let energyFee = 0;
  for (const p of (params.chainParameter || [])) {
    if (p.key === "getEnergyFee") { energyFee = p.value || 0; break; }
  }
  console.log(fmt({
    energy_price_sun: energyFee,
    energy_price_trx_per_10k: Math.round(energyFee * 10000 / SUN_PER_TRX * 10000) / 10000,
    usdt_transfer_cost_trx: Math.round(energyFee * 65000 / SUN_PER_TRX * 100) / 100,
    sunswap_v2_cost_trx: Math.round(energyFee * 130000 / SUN_PER_TRX * 100) / 100,
    note: "Costs shown assume zero staked energy. Staking eliminates these burns.",
  }));
}


async function cmdEnergyRental({ amount = 65000 }) {
  console.log(fmt({
    energy_needed: parseInt(amount),
    rental_platforms: [
      { name: "TronNRG", url: "https://tronnrg.com", description: "Community energy marketplace" },
      { name: "JustLend", url: "https://justlend.org", description: "Official TRON lending + energy rental" },
      { name: "Feee.io", url: "https://feee.io", description: "Energy rental service" },
    ],
    tip: `For ${amount} energy, compare rental price vs. freezing TRX vs. burning TRX.`,
  }));
}

async function cmdOptimizeCost({ address }) {
  address = normalizeAddress(address);

  const [resourceData, accountData, paramsData] = await Promise.all([
    httpPost(`${BASE_URL}/wallet/getaccountresource`, { address, visible: true }),
    httpGet(`${BASE_URL}/v1/accounts/${address}`),
    httpGet(`${BASE_URL}/wallet/getchainparameters`),
  ]);

  const energyLimit = resourceData.EnergyLimit || 0;
  const balance = accountData.data?.[0]?.balance || 0;
  const trxBalance = sunToTrx(balance);

  let energyFee = 420;
  for (const p of (paramsData.chainParameter || [])) {
    if (p.key === "getEnergyFee") { energyFee = p.value || 0; break; }
  }

  const usdtBurn = energyFee * 65000 / SUN_PER_TRX;
  const dailyEnergyPerTrx = 4.5;

  const result = {
    address,
    current_state: {
      trx_balance: trxBalance,
      energy_available: energyLimit,
      can_do_usdt_transfer_free: energyLimit >= 65000,
    },
    recommendations: [],
  };

  if (energyLimit < 65000) {
    const freezeNeeded = Math.ceil(65000 / dailyEnergyPerTrx) + 1;
    result.recommendations.push(
      {
        strategy: "Freeze TRX for Energy",
        description: `Freeze ~${freezeNeeded} TRX to get 65,000 energy/day for free USDT transfers`,
        trx_needed: freezeNeeded,
        lock_period: "14 days minimum",
        savings_per_tx: `~${usdtBurn.toFixed(1)} TRX`,
      },
      {
        strategy: "Rent Energy",
        description: "Rent energy from marketplace for occasional use",
        best_for: "1-5 transactions per month",
        platforms: ["TronNRG", "JustLend", "Feee.io"],
      },
      {
        strategy: "Accept TRX Burn",
        description: `Each USDT transfer burns ~${usdtBurn.toFixed(1)} TRX`,
        best_for: "Rare one-off transactions",
        no_lock_required: true,
      }
    );
  } else {
    result.recommendations.push({
      strategy: "Current setup is optimal",
      description: "You have enough staked energy for basic operations.",
    });
  }
  console.log(fmt(result));
}

// ---------------------------------------------------------------------------
// Staking Commands
// ---------------------------------------------------------------------------


async function cmdSrList({ limit = 30 }) {
  const data = await httpGet(`${TRONSCAN_API}/vote/witness`, { limit, start: 0 });
  const srs = (data.data || []).map(w => ({
    rank: w.realTimeRanking || 0, name: w.name || "Unknown",
    address: w.address || "",
    total_votes: w.realTimeVotes || 0,
    vote_percentage: w.votesPercentage || 0,
    blocks_produced: w.producedTotal || 0,
    efficiency: w.producedEfficiency || 0,
    annualized_rate: w.annualizedRate || 0,
    url: w.url || "",
  }));
  console.log(fmt({ super_representatives: srs, count: srs.length }));
}

async function cmdStakingInfo({ address }) {
  address = normalizeAddress(address);
  const accountData = await httpGet(`${BASE_URL}/v1/accounts/${address}`);
  if (!accountData.data?.length) return console.log(fmt({ error: "Account not found" }));

  const acct = accountData.data[0];
  const rewardData = await httpPost(`${BASE_URL}/wallet/getReward`, { address, visible: true });

  console.log(fmt({
    address,
    frozen: {
      for_energy: (acct.frozenV2 || []).filter(f => f.type === "ENERGY"),
      for_bandwidth: (acct.frozenV2 || []).filter(f => f.type !== "ENERGY"),
    },
    pending_unfreezes: (acct.unfrozenV2 || []).map(u => ({
      amount_sun: u.unfreeze_amount || 0,
      amount_trx: sunToTrx(u.unfreeze_amount || 0),
      expire_time: u.unfreeze_expire_time ? new Date(u.unfreeze_expire_time).toISOString() : null,
    })),
    votes: (acct.votes || []).map(v => ({
      sr_address: v.vote_address || "",
      vote_count: v.vote_count || 0,
    })),
    tron_power: acct.tron_power?.frozen_balance || 0,
    unclaimed_reward_sun: rewardData.reward || 0,
    unclaimed_reward_trx: sunToTrx(rewardData.reward || 0),
  }));
}

async function cmdStakingApy({ amount = "10000" }) {
  const amountNum = parseFloat(amount);
  const data = await httpGet(`${TRONSCAN_API}/vote/witness`, { limit: 5 });
  const topSr = data.data?.[0] || {};
  const apy = parseFloat(topSr.annualizedRate) || 4.0;
  const daily = amountNum * (apy / 100) / 365;

  console.log(fmt({
    staking_amount_trx: amountNum,
    estimated_apy_pct: apy,
    estimated_rewards: {
      daily_trx: Math.round(daily * 10000) / 10000,
      monthly_trx: Math.round(daily * 30 * 100) / 100,
      yearly_trx: Math.round(amountNum * (apy / 100) * 100) / 100,
    },
    top_sr_reference: { name: topSr.name || "Unknown", total_votes: topSr.realTimeVotes || 0, apy_pct: apy },
    note: "APY varies based on SR performance, total network stake, and commission rates.",
  }));
}


// ---------------------------------------------------------------------------
// CLI Parser
// ---------------------------------------------------------------------------

const COMMANDS = {
  // Wallet
  "wallet-balance":    { opts: { address: { type: "string" } }, required: ["address"], handler: cmdWalletBalance },
  "token-balance":     { opts: { address: { type: "string" }, contract: { type: "string" } }, required: ["address", "contract"], handler: cmdTokenBalance },
  "wallet-tokens":     { opts: { address: { type: "string" } }, required: ["address"], handler: cmdWalletTokens },
  "tx-history":        { opts: { address: { type: "string" }, limit: { type: "string", default: "20" } }, required: ["address"], handler: (a) => cmdTxHistory({ ...a, limit: parseInt(a.limit) }) },
  "account-info":      { opts: { address: { type: "string" } }, required: ["address"], handler: cmdAccountInfo },
  "validate-address":  { opts: { address: { type: "string" } }, required: ["address"], handler: cmdValidateAddress },

  // Token
  "token-info":        { opts: { contract: { type: "string" } }, required: ["contract"], handler: cmdTokenInfo },
  "token-search":      { opts: { keyword: { type: "string" } }, required: ["keyword"], handler: cmdTokenSearch },
  "contract-info":     { opts: { contract: { type: "string" } }, required: ["contract"], handler: cmdContractInfo },
  "token-holders":     { opts: { contract: { type: "string" }, limit: { type: "string", default: "20" } }, required: ["contract"], handler: (a) => cmdTokenHolders({ ...a, limit: parseInt(a.limit) }) },
  "trending-tokens":   { opts: {}, required: [], handler: cmdTrendingTokens },
  "token-rankings":    { opts: { "sort-by": { type: "string", default: "market_cap" } }, required: [], handler: (a) => cmdTokenRankings({ sortBy: a["sort-by"] }) },
  "token-security":    { opts: { contract: { type: "string" } }, required: ["contract"], handler: cmdTokenSecurity },

  // Market
  "token-price":       { opts: { contract: { type: "string" } }, required: ["contract"], handler: cmdTokenPrice },
  "kline":             { opts: { contract: { type: "string" }, interval: { type: "string", default: "1h" }, limit: { type: "string", default: "100" } }, required: ["contract"], handler: (a) => cmdKline({ ...a, limit: parseInt(a.limit) }) },
  "trade-history":     { opts: { contract: { type: "string" }, limit: { type: "string", default: "50" } }, required: ["contract"], handler: (a) => cmdTradeHistory({ ...a, limit: parseInt(a.limit) }) },
  "dex-volume":        { opts: { contract: { type: "string" }, period: { type: "string", default: "24h" } }, required: ["contract"], handler: cmdDexVolume },
  "whale-transfers":   { opts: { contract: { type: "string" }, "min-value": { type: "string", default: "100000" } }, required: ["contract"], handler: (a) => cmdWhaleTransfers({ ...a, minValue: parseFloat(a["min-value"]) }) },
  "large-transfers":   { opts: { "min-trx": { type: "string", default: "100000" }, limit: { type: "string", default: "20" } }, required: [], handler: (a) => cmdLargeTransfers({ minTrx: parseFloat(a["min-trx"]), limit: parseInt(a.limit) }) },
  "pool-info":         { opts: { contract: { type: "string" } }, required: ["contract"], handler: cmdPoolInfo },
  "market-overview":   { opts: {}, required: [], handler: cmdMarketOverview },

  // Swap
  "swap-quote":        { opts: { "from-token": { type: "string" }, "to-token": { type: "string" }, amount: { type: "string" } }, required: ["from-token", "to-token", "amount"], handler: (a) => cmdSwapQuote({ fromToken: a["from-token"], toToken: a["to-token"], amount: a.amount }) },
  "swap-route":        { opts: { "from-token": { type: "string" }, "to-token": { type: "string" }, amount: { type: "string" } }, required: ["from-token", "to-token", "amount"], handler: (a) => cmdSwapQuote({ fromToken: a["from-token"], toToken: a["to-token"], amount: a.amount }) },
  "tx-status":         { opts: { txid: { type: "string" } }, required: ["txid"], handler: cmdTxStatus },

  // Resource
  "resource-info":     { opts: { address: { type: "string" } }, required: ["address"], handler: cmdResourceInfo },
  "estimate-energy":   { opts: { contract: { type: "string" }, function: { type: "string" }, params: { type: "string", default: "" }, caller: { type: "string" } }, required: ["contract", "function", "caller"], handler: (a) => cmdEstimateEnergy({ contract: a.contract, func: a.function, params: a.params, caller: a.caller }) },
  "estimate-bandwidth":{ opts: { "tx-size": { type: "string", default: "267" } }, required: [], handler: (a) => cmdEstimateBandwidth({ txSize: parseInt(a["tx-size"]) }) },
  "energy-price":      { opts: {}, required: [], handler: cmdEnergyPrice },
  "energy-rental":     { opts: { amount: { type: "string", default: "65000" } }, required: [], handler: cmdEnergyRental },
  "optimize-cost":     { opts: { address: { type: "string" } }, required: ["address"], handler: cmdOptimizeCost },

  // Staking
  "sr-list":           { opts: { limit: { type: "string", default: "30" } }, required: [], handler: (a) => cmdSrList({ limit: parseInt(a.limit) }) },
  "staking-info":      { opts: { address: { type: "string" } }, required: ["address"], handler: cmdStakingInfo },
  "staking-apy":       { opts: { amount: { type: "string", default: "10000" } }, required: [], handler: cmdStakingApy },
};

function printHelp() {
  console.log(`
tron_api.mjs — TronLink Wallet Skills CLI (Node.js)

Usage: node tron_api.mjs <command> [--option value ...]

Commands:
  Wallet:
    wallet-balance      --address <ADDR>
    token-balance       --address <ADDR> --contract <TOKEN>
    wallet-tokens       --address <ADDR>
    tx-history          --address <ADDR> [--limit N]
    account-info        --address <ADDR>
    validate-address    --address <ADDR>

  Token:
    token-info          --contract <TOKEN>
    token-search        --keyword <KEYWORD>
    contract-info       --contract <TOKEN>
    token-holders       --contract <TOKEN> [--limit N]
    trending-tokens
    token-rankings      [--sort-by market_cap|volume|holders|gainers|losers]
    token-security      --contract <TOKEN>

  Market:
    token-price         --contract <TOKEN|TRX>
    kline               --contract <TOKEN> [--interval 1h] [--limit 100]
    trade-history       --contract <TOKEN> [--limit 50]
    dex-volume          --contract <TOKEN> [--period 24h]
    whale-transfers     --contract <TOKEN> [--min-value 100000]
    large-transfers     [--min-trx 100000] [--limit 20]
    pool-info           --contract <TOKEN>
    market-overview

  Swap:
    swap-quote          --from-token <TOKEN> --to-token <TOKEN> --amount <N>
    swap-route          --from-token <TOKEN> --to-token <TOKEN> --amount <N>
    tx-status           --txid <HASH>

  Resource:
    resource-info       --address <ADDR>
    estimate-energy     --contract <TOKEN> --function <SIG> --caller <ADDR> [--params <P>]
    estimate-bandwidth  [--tx-size 267]
    energy-price
    energy-rental       [--amount 65000]
    optimize-cost       --address <ADDR>

  Staking:
    sr-list             [--limit 30]
    staking-info        --address <ADDR>
    staking-apy         [--amount 10000]

Environment:
    TRONGRID_API_KEY       TronGrid API key (optional, for higher rate limits)
    TRON_NETWORK           mainnet (default) | shasta | nile
  `);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  const cmdDef = COMMANDS[command];
  if (!cmdDef) {
    console.error(`Unknown command: ${command}\nRun with --help for usage.`);
    process.exit(1);
  }

  // Parse command-specific options
  const cmdArgs = args.slice(1);
  let parsed;
  try {
    parsed = parseArgs({
      args: cmdArgs,
      options: cmdDef.opts,
      strict: false,
    });
  } catch (e) {
    console.error(`Error parsing options: ${e.message}`);
    process.exit(1);
  }

  // Check required options
  for (const req of cmdDef.required) {
    if (!parsed.values[req]) {
      console.error(`Missing required option: --${req}`);
      process.exit(1);
    }
  }

  await cmdDef.handler(parsed.values);
}

main().catch(e => {
  console.error(`Fatal error: ${e.message}`);
  process.exit(1);
});
