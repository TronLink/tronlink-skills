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
import { pathToFileURL } from "node:url";

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
  USDD: { contract: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz", symbol: "USDD", decimals: 18, name: "Decentralized USD (USDD 2.0)" },
  TUSD: { contract: "TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4", symbol: "TUSD", decimals: 18, name: "TrueUSD" },
  USDJ: { contract: "TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT", symbol: "USDJ", decimals: 18, name: "JUST Stablecoin" },
  // APENFT's on-chain symbol is "NFT"; expose both aliases to the same contract.
  APENFT: { contract: "TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq", symbol: "NFT", decimals: 6, name: "APENFT" },
  NFT:    { contract: "TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq", symbol: "NFT", decimals: 6, name: "APENFT" },
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

// Parse an HTTP response as JSON, returning a clear { error, status } envelope on
// failure instead of usable-looking data. Two failure modes are caught:
//   1. Non-2xx status (429 rate limit, 5xx gateway) — even when the body is valid
//      JSON. Without this, a JSON 429 would parse fine and callers would fall back
//      to 0 / "Unknown" / empty lists, presenting rate-limits as real zero data.
//   2. Non-JSON body (HTML error page) — would otherwise throw "Unexpected token <".
// Valid-JSON 2xx happy path is unchanged.
async function parseJsonResponse(resp) {
  const text = await resp.text();
  if (!resp.ok) {
    return {
      error: `API error: HTTP ${resp.status} ${resp.statusText || ""}`.trim(),
      status: resp.status,
      body: text.slice(0, 200),
    };
  }
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: `Non-JSON response from API (HTTP ${resp.status})`,
      status: resp.status,
      body: text.slice(0, 200),
    };
  }
}

function requestError(e) {
  return { error: e.name === "TimeoutError" ? "Request timed out after 15s" : e.message };
}

// True when an httpGet/httpPost result is an error envelope (network failure,
// non-2xx status, rate limit, or non-JSON body) rather than usable data.
function apiFailed(data) {
  return !data || typeof data !== "object" || typeof data.error === "string";
}

// Standard "upstream gave us nothing usable" reply, so callers never fabricate
// 0 / "Unknown" / [] when the API errored or returned an unexpected shape.
function unavailable(extra, data, what = "data") {
  return {
    ...extra,
    error: (data && data.error) || `${what} unavailable — API returned no usable data (token not found or rate-limited)`,
    ...(data && data.status ? { status: data.status } : {}),
  };
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
    return await parseJsonResponse(resp);
  } catch (e) {
    return requestError(e);
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
    return await parseJsonResponse(resp);
  } catch (e) {
    return requestError(e);
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
  if (apiFailed(data)) return console.log(fmt(unavailable({ address, token_contract: contract }, data, "Token balance")));
  if (!data.data?.length) return console.log(fmt({ address, error: "Account not found or not activated" }));

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
  if (apiFailed(data)) return console.log(fmt(unavailable({ address }, data, "Wallet tokens")));
  if (!data.data?.length) return console.log(fmt({ address, error: "Account not found or not activated" }));

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

async function cmdWalletApprovals({ address, limit = 50 }) {
  address = normalizeAddress(address);
  const data = await httpGet(`${TRONSCAN_API}/account/approve/list`, { address, limit, start: 0 });
  if (apiFailed(data) || !Array.isArray(data.data)) {
    return console.log(fmt(unavailable({ address }, data, "Approval data")));
  }

  const approvals = data.data.map(a => ({
    token: a.tokenInfo?.tokenAbbr || a.contract_address || "",
    token_name: a.tokenInfo?.tokenName || "",
    token_contract: a.contract_address || "",
    spender: a.to_address || "",
    spender_project: a.project_id || "",
    allowance: a.unlimited ? "UNLIMITED" : (a.amount ?? "0"),
    unlimited: Boolean(a.unlimited),
    approved_at: a.operate_time ? new Date(a.operate_time).toISOString() : null,
    risk: a.unlimited ? "HIGH — unlimited allowance" : "review the spender",
  }));
  const unlimitedCount = approvals.filter(a => a.unlimited).length;

  console.log(fmt({
    address,
    approvals,
    total_approvals: data.total ?? approvals.length,
    unlimited_approvals: unlimitedCount,
    count: approvals.length,
    note: unlimitedCount > 0
      ? `⚠️ ${unlimitedCount} unlimited approval(s): a compromised or malicious spender contract could drain that token at any time. Revoke unused approvals in the TronLink wallet.`
      : "No unlimited approvals found. Still review any spender you don't recognize.",
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
  if (apiFailed(data)) return console.log(fmt(unavailable({ address }, data, "Account info")));
  if (!data.data?.length) return console.log(fmt({ address, error: "Account not found or not activated" }));

  const acct = data.data[0];
  const resource = await httpPost(`${BASE_URL}/wallet/getaccountresource`, { address, visible: true });
  // The resource call can fail independently — show null + a note rather than
  // default values (600 free bandwidth / 0 energy) that look like real data.
  const resourceOk = !apiFailed(resource);

  console.log(fmt({
    address,
    balance_trx: sunToTrx(acct.balance || 0),
    create_time: acct.create_time ? new Date(acct.create_time).toISOString() : null,
    is_witness: acct.is_witness || false,
    frozen_v2: acct.frozenV2 || [],
    unfrozen_v2: acct.unfrozenV2 || [],
    votes: acct.votes || [],
    tron_power: acct.tron_power || {},
    permissions: {
      owner: acct.owner_permission || null,
      active: acct.active_permission || [],
      witness: acct.witness_permission || null,
    },
    resource_overview: resourceOk ? {
      free_bandwidth_limit: resource.freeNetLimit || 600,
      free_bandwidth_used: resource.freeNetUsed || 0,
      staked_bandwidth_limit: resource.NetLimit || 0,
      staked_bandwidth_used: resource.NetUsed || 0,
      energy_limit: resource.EnergyLimit || 0,
      energy_used: resource.EnergyUsed || 0,
    } : null,
    network: NETWORK,
    ...(resourceOk ? {} : { data_issues: ["resource (energy/bandwidth) data unavailable — rate-limited or RPC error"] }),
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

// TRX is the native TRON coin, not a TRC-20 contract, so the contract-metadata
// commands (token-info / contract-info / token-holders / token-security) can't
// query it on TronScan — they'd return a confusing "token not found". Surface one
// consistent hint instead, matching how token-price/token-overview handle TRX.
function isNativeTrx(contract) {
  return typeof contract === "string" && contract.trim().toUpperCase() === "TRX";
}
const TRX_NATIVE_HINT = {
  info: "TRX is the native TRON coin, not a TRC-20 contract — this command only works on token contracts. For TRX data use `token-price --contract TRX` (price), `market-overview` (network stats), or `wallet-balance --address <addr>` (balance).",
  native_coin: "TRX",
};

async function cmdTokenInfo({ contract }) {
  if (isNativeTrx(contract)) return console.log(fmt(TRX_NATIVE_HINT));
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
  const kw = keyword.toLowerCase();
  const seen = new Set();
  const results = [];

  // Seed with built-in known tokens whose symbol/name matches, so common tokens
  // (USDT, USDD, APENFT, ...) always resolve — even when they fall outside the
  // public top-100 list or the legacy /search endpoint is gone (HTTP 410).
  for (const v of Object.values(KNOWN_TOKENS)) {
    if (v.contract === "TRX" || seen.has(v.contract)) continue;
    if (v.symbol.toLowerCase().includes(kw) || v.name.toLowerCase().includes(kw)) {
      seen.add(v.contract);
      results.push({ name: v.name, symbol: v.symbol, contract: v.contract, source: "known" });
    }
  }

  // Then add live matches. /search/v2 needs a TronScan API key; without one, filter
  // the public top-tokens list client-side.
  let live = [];
  let liveSource = null;
  if (TRONSCAN_API_KEY) {
    const v2 = await httpGet(`${TRONSCAN_API}/search/v2`, { term: keyword, type: "token" });
    if (!apiFailed(v2)) {
      live = (v2.tokens || v2.data || v2.result || []).map(t => ({
        name: t.name || t.tokenName || "", symbol: t.abbr || t.symbol || t.tokenAbbr || "",
        contract: t.contractAddress || t.contract_address || t.address || "",
        holders: t.nrOfTokenHolders || t.holders_count || 0,
        price_usd: t.priceInUsd || t.price || 0, market_cap: t.marketCapUSD || t.market_cap_usd || 0,
      }));
      liveSource = "TronScan search/v2";
    }
  }
  if (!liveSource) {
    const data = await httpGet(`${TRONSCAN_API}/tokens/overview`, { start: 0, limit: 100, filter: "", value: keyword });
    if (apiFailed(data) || !Array.isArray(data.tokens)) {
      // Return any built-in matches rather than a hard error when live search is down.
      if (results.length) return console.log(fmt({ query: keyword, results, count: results.length, source: "known tokens (live search unavailable)" }));
      return console.log(fmt(unavailable({ query: keyword }, data, "Token search")));
    }
    live = data.tokens
      .filter(t => (t.abbr || "").toLowerCase().includes(kw) || (t.name || "").toLowerCase().includes(kw))
      .map(t => ({
        name: t.name || "", symbol: t.abbr || "", contract: t.contractAddress || "",
        holders: t.nrOfTokenHolders || 0, price_usd: t.priceInUsd || 0, market_cap: t.marketCapUSD || 0,
      }))
      .sort((a, b) => b.holders - a.holders);
    liveSource = "TronScan top-tokens (public)";
  }

  for (const t of live) {
    if (!t.contract || t.contract === "_" || seen.has(t.contract)) continue;
    seen.add(t.contract);
    results.push(t);
  }
  const out = results.slice(0, 20);
  console.log(fmt({
    query: keyword,
    results: out,
    count: out.length,
    source: liveSource,
    ...(out.length === 0
      ? { note: "No match. Long-tail tokens need a key — set TRONSCAN_API_KEY (TronScan /search/v2 requires it)." }
      : {}),
  }));
}

async function cmdContractInfo({ contract }) {
  if (isNativeTrx(contract)) return console.log(fmt(TRX_NATIVE_HINT));
  const data = await httpGet(`${TRONSCAN_API}/contract`, { contract });
  if (apiFailed(data) || !data.data?.[0]) {
    return console.log(fmt(unavailable({ contract }, data, "Contract info")));
  }
  const c = data.data[0];
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
  if (isNativeTrx(contract)) return console.log(fmt(TRX_NATIVE_HINT));
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  // The holders endpoint's `rangeTotal` is the HOLDER COUNT, not the token supply.
  // Percentages must be balance / total_supply_with_decimals, so fetch token info too.
  const [data, tokenData] = await Promise.all([
    httpGet(`${TRONSCAN_API}/token_trc20/holders`, { contract_address: contract, limit, start: 0 }),
    httpGet(`${TRONSCAN_API}/token_trc20`, { contract }),
  ]);

  if (apiFailed(data) || !Array.isArray(data.trc20_tokens)) {
    return console.log(fmt(unavailable({ contract }, data, "Holder data")));
  }

  const token = tokenData.trc20_tokens?.[0] || {};
  const decimals = parseInt(token.decimals ?? resolved.decimals ?? 6);
  const totalSupplyRaw = parseFloat(token.total_supply_with_decimals || 0);
  const holderCount = data.rangeTotal || token.holders_count || 0;

  const holders = data.trc20_tokens.map(h => {
    const rawBal = parseFloat(h.balance || 0);
    return {
      address: h.holder_address || "",
      address_tag: h.addressTag || "",
      balance: decimals ? rawBal / (10 ** decimals) : rawBal,
      percentage: totalSupplyRaw > 0 ? ((rawBal / totalSupplyRaw) * 100).toFixed(4) + "%" : "N/A",
    };
  });
  console.log(fmt({
    contract,
    holders,
    total_holders: holderCount,
    total_supply: totalSupplyRaw ? totalSupplyRaw / (10 ** decimals) : null,
    count: holders.length,
    ...(totalSupplyRaw > 0 ? {} : { note: "percentage is N/A — total supply unavailable (token info not returned / rate-limited)" }),
    ...(limit > 50 && holders.length <= 50 ? { note_limit: "TronScan returns at most ~50 holders per query, regardless of --limit." } : {}),
  }));
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
  // Use TronScan's token list (real holder counts), not CoinGecko, so the `holders`
  // ranking is genuine and every row carries a holder count. We pull the top tokens
  // by market cap and re-rank them by the requested metric client-side.
  const data = await httpGet(`${TRONSCAN_API}/tokens/overview`, { start: 0, limit: 60, filter: "", order: "marketcap" });
  if (apiFailed(data) || !Array.isArray(data.tokens)) {
    return console.log(fmt(unavailable({ sort_by: sortBy }, data, "Token rankings")));
  }
  let tokens = data.tokens
    .filter(t => t.contractAddress && t.contractAddress !== "_")
    .map(t => ({
      name: t.name || "", symbol: t.abbr || "", contract: t.contractAddress || "",
      holders: t.nrOfTokenHolders || 0,
      price_usd: t.priceInUsd || 0,
      market_cap: t.marketCapUSD || 0,
      volume_24h: t.volume24hInUsd || 0,
      change_24h: t.gain ?? 0,
    }));
  const cmp = {
    market_cap: (a, b) => b.market_cap - a.market_cap,
    volume: (a, b) => b.volume_24h - a.volume_24h,
    holders: (a, b) => b.holders - a.holders,
    gainers: (a, b) => b.change_24h - a.change_24h,
    losers: (a, b) => a.change_24h - b.change_24h,
  };
  tokens.sort(cmp[sortBy] || cmp.market_cap);
  tokens = tokens.slice(0, 20).map((t, i) => ({ rank: i + 1, ...t }));
  console.log(fmt({
    sort_by: sortBy, tokens, count: tokens.length,
    source: "TronScan tokens/overview",
    note: "Ranked among the top TRON tokens by market cap, re-sorted by the chosen metric.",
  }));
}

async function cmdTokenSecurity({ contract }) {
  if (isNativeTrx(contract)) return console.log(fmt(TRX_NATIVE_HINT));
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  const [contractData, holderData, tokenData] = await Promise.all([
    httpGet(`${TRONSCAN_API}/contract`, { contract }),
    httpGet(`${TRONSCAN_API}/token_trc20/holders`, { contract_address: contract, limit: 10, start: 0 }),
    httpGet(`${TRONSCAN_API}/token_trc20`, { contract }),
  ]);

  // A security verdict built from rate-limited/partial data is misleading (it would
  // report "0 holders / not verified"), so bail if any of the three calls failed.
  if (apiFailed(tokenData) || !tokenData.trc20_tokens?.[0] || apiFailed(contractData) || apiFailed(holderData)) {
    const failed = [tokenData, contractData, holderData].find(apiFailed) || tokenData;
    return console.log(fmt(unavailable({ contract }, failed, "Token security data")));
  }
  const c = contractData.data?.[0] || {};
  const t = tokenData.trc20_tokens[0];
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
    if (apiFailed(data) || !data.tron) {
      return console.log(fmt(unavailable({ token: "TRX" }, data, "TRX price")));
    }
    const trx = data.tron;
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
  const token = data.trc20_tokens?.[0];
  if (apiFailed(data) || !token) {
    return console.log(fmt(unavailable({ contract }, data, "Price")));
  }
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
    // Distinguish a lookup API failure (rate-limit) from "this token isn't listed".
    if (apiFailed(lookup)) {
      return console.log(fmt(unavailable({ contract: resolved.contract }, lookup, "K-line lookup")));
    }
    cgId = lookup.id;
  }

  if (!cgId) {
    return console.log(fmt({
      contract: resolved.contract,
      info: "Token not found on CoinGecko for K-line data.",
      suggestion: "Use TronScan or SunSwap for detailed chart data.",
      tronscan_url: `https://tronscan.org/#/token20/${resolved.contract}`,
    }));
  }

  const data = await httpGet(`${COINGECKO_API}/coins/${cgId}/ohlc`, {
    vs_currency: "usd", days,
  });

  if (apiFailed(data)) {
    return console.log(fmt(unavailable({ contract: resolved.contract }, data, "K-line data")));
  }
  if (!Array.isArray(data) || data.length === 0) {
    return console.log(fmt({
      contract: resolved.contract,
      info: "No K-line data returned for this token (CoinGecko has no OHLC series for it).",
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
  if (apiFailed(data) || !Array.isArray(data.token_transfers)) {
    return console.log(fmt(unavailable({ contract }, data, "Trade history")));
  }
  const transfers = data.token_transfers.map(t => {
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
  const token = data.trc20_tokens?.[0];
  if (apiFailed(data) || !token) {
    return console.log(fmt(unavailable({ contract, period }, data, "Volume data")));
  }
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

  // TronScan's free API ignores `sort=-quant` and caps `limit` at 50, so we cannot
  // ask the server for the largest transfers. We fetch the most recent 50 and sort
  // them by amount client-side — so this scans a recent window, NOT full history.
  const SCAN = 50;
  const data = await httpGet(`${TRONSCAN_API}/token_trc20/transfers`, {
    contract_address: contract, limit: SCAN, start: 0, sort: "-timestamp",
  });
  if (apiFailed(data) || !Array.isArray(data.token_transfers)) {
    return console.log(fmt(unavailable({ contract }, data, "Transfer data")));
  }

  const scanned = data.token_transfers.length;
  const transfers = data.token_transfers
    .map(t => {
      const decimals = parseInt(t.tokenInfo?.tokenDecimal || 6);
      const amount = parseFloat(t.quant || 0) / (10 ** decimals);
      return {
        txid: t.transaction_id || "", from: t.from_address || "",
        to: t.to_address || "", amount,
        timestamp: t.block_ts ? new Date(t.block_ts).toISOString() : "",
        symbol: t.tokenInfo?.tokenAbbr || resolved.symbol,
      };
    })
    .filter(t => t.amount >= minValue)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);

  console.log(fmt({
    contract,
    min_amount_filter: minValue,
    min_amount_unit: "token units (not USD)",
    large_transfers: transfers,
    count: transfers.length,
    scanned_window: `${scanned} most recent transfers (TronScan free-API cap)`,
    note: "Scans only the most recent ~50 transfers, NOT full history — a whale-sized transfer older than this window won't appear. For comprehensive whale tracking use a TronScan/DEX explorer. An empty list means none of the recent transfers met the threshold, not that none exist.",
  }));
}

async function cmdLargeTransfers({ minTrx = 100000, limit = 20 }) {
  // TronScan ignores `sort=-amount` and caps the page at 50, so we scan the most
  // recent transactions and sort by TRX amount client-side. Most recent txs are
  // 0-TRX contract calls, so genuinely large TRX transfers are sparse in any
  // recent window — an empty list means "none recently", not "none exist".
  const SCAN = 50;
  const data = await httpGet(`${TRONSCAN_API}/transaction`, { sort: "-timestamp", limit: SCAN, start: 0 });
  if (apiFailed(data) || !Array.isArray(data.data)) {
    return console.log(fmt(unavailable({ min_trx: minTrx }, data, "Large transfer data")));
  }
  const scanned = data.data.length;
  const transfers = data.data
    .map(tx => ({
      txid: tx.hash || "", from: tx.ownerAddress || "",
      to: tx.toAddress || "", amount_trx: sunToTrx(tx.amount || 0),
      timestamp: tx.timestamp ? new Date(tx.timestamp).toISOString() : "",
      confirmed: tx.confirmed || false,
    }))
    .filter(t => t.amount_trx >= minTrx)
    .sort((a, b) => b.amount_trx - a.amount_trx)
    .slice(0, limit);
  console.log(fmt({
    min_trx: minTrx,
    transfers,
    count: transfers.length,
    scanned_window: `${scanned} most recent transactions (TronScan free-API cap)`,
    note: "Scans only the most recent ~50 transactions, NOT full history. Large native-TRX transfers are sparse, so an empty list usually means none occurred recently — use a block explorer for comprehensive large-transfer tracking.",
  }));
}

async function cmdPoolInfo({ contract }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  // Use token_trc20 market_info for liquidity data since defi/pools is no longer available
  const data = await httpGet(`${TRONSCAN_API}/token_trc20`, { contract });
  const token = data.trc20_tokens?.[0];
  if (apiFailed(data) || !token) {
    return console.log(fmt(unavailable({ contract }, data, "Pool/liquidity data")));
  }
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
  // The two sources are independent; report each as null (not 0) when unavailable
  // so a failed/rate-limited call is never shown as a real zero price or block.
  const priceOk = !apiFailed(priceData) && priceData.tron;
  const sysOk = !apiFailed(sysData) && (sysData.database || sysData.full);
  const trx = priceData.tron || {};
  const issues = [];
  if (!priceOk) issues.push("TRX price/market data unavailable (CoinGecko error or rate-limited)");
  if (!sysOk) issues.push("network/block data unavailable (TronScan error or rate-limited)");
  console.log(fmt({
    tron_network: {
      trx_price_usd: priceOk ? (trx.usd ?? null) : null,
      trx_24h_change: priceOk ? (trx.usd_24h_change ?? null) : null,
      trx_market_cap: priceOk ? (trx.usd_market_cap ?? null) : null,
      trx_24h_volume: priceOk ? (trx.usd_24h_vol ?? null) : null,
      latest_block: sysOk ? (sysData.database?.block || sysData.full?.block || null) : null,
      confirmed_block: sysOk ? (sysData.database?.confirmedBlock || sysData.solidity?.block || null) : null,
      network_env: sysOk ? (sysData.network?.env || "unknown") : null,
    },
    ...(issues.length ? { data_issues: issues } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Swap Commands
// ---------------------------------------------------------------------------

async function cmdSwapQuote({ fromToken, toToken, amount, slippage = 0.5 }) {
  // Defensive guard (CLI/MCP already validate, but keep cmd self-contained)
  const amountNum = parseFloat(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return console.log(fmt({ error: `Invalid --amount "${amount}": must be a positive number`, status: 400 }));
  }
  const fromInfo = resolveToken(fromToken);
  const toInfo = resolveToken(toToken);
  const amountRaw = Math.round(amountNum * (10 ** fromInfo.decimals));

  // Sun.io Smart Router requires the WTRX address instead of native TRX — on BOTH
  // sides. Without converting the destination, any "<token> → TRX" quote (selling
  // a token for TRX) is rejected by the router with "INVALID FROM/TO ADDRESS".
  const WTRX_ADDRESS = KNOWN_TOKENS.WTRX?.contract || "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR";
  const fromAddr = fromInfo.contract === "TRX" ? WTRX_ADDRESS : fromInfo.contract;
  const toAddr = toInfo.contract === "TRX" ? WTRX_ADDRESS : toInfo.contract;

  const data = await httpGet(`${SWAP_ROUTER_BASE}/swap/router`, {
    fromToken: fromAddr, toToken: toAddr,
    amountIn: String(amountRaw),
    typeList: "PSM,CURVE,WTRX,SUNSWAP_V2,SUNSWAP_V3",
  });

  if (data.error || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
    return console.log(fmt({
      from: fromToken, to: toToken, amount_in: parseFloat(amount),
      status: "Quote API unavailable — try SunSwap directly",
      sunswap_url: "https://sunswap.com",
      estimated_energy: "65,000-200,000 (depends on route complexity)",
      estimated_trx_burn: "~6.5-20 TRX at the current ~100 SUN energy fee, if no staked energy — run `energy-price`/`tx-cost` for the live figure",
    }));
  }

  // API returns an array of routes sorted by best output; take the first (best) route
  const best = data.data[0];
  const amountOut = parseFloat(best.amountOut || 0);
  // Clamp slippage to [0, 50]% — a >100% slippage would otherwise make
  // minimum_received negative, which is nonsensical. Floor it at 0 as well.
  const slip = Math.min(Math.max(0, parseFloat(slippage) || 0), 50);
  const minReceived = Math.max(0, amountOut * (1 - slip / 100));

  console.log(fmt({
    from: fromToken, to: toToken,
    amount_in: parseFloat(amount),
    amount_out: amountOut,
    slippage_pct: slip,
    minimum_received: Math.round(minReceived * 1e6) / 1e6,
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

  if (apiFailed(txData)) return console.log(fmt(unavailable({ txid }, txData, "Transaction status")));
  if (!txData.txID) return console.log(fmt({ txid, error: `Transaction ${txid} not found` }));

  // The receipt (energy/bandwidth/fees) comes from a second call that can fail on
  // its own — show those as null + a note rather than as a real "0 fee" tx.
  const infoOk = !apiFailed(infoData);
  const receipt = infoData.receipt || {};

  console.log(fmt({
    txid,
    status: (txData.ret || [{}])[0].contractRet || "UNKNOWN",
    block_number: infoOk ? (infoData.blockNumber || 0) : null,
    timestamp: infoOk && infoData.blockTimeStamp ? new Date(infoData.blockTimeStamp).toISOString() : null,
    energy_used: infoOk ? (receipt.energy_usage_total || 0) : null,
    bandwidth_used: infoOk ? (receipt.net_usage || infoData.receipt?.net_usage || 0) : null,
    energy_fee_sun: infoOk ? (receipt.energy_fee || 0) : null,
    net_fee_sun: infoOk ? (receipt.net_fee || infoData.fee || 0) : null,
    tronscan_url: `https://tronscan.org/#/transaction/${txid}`,
    ...(infoOk ? {} : { data_issues: ["transaction receipt (energy/bandwidth/fees) unavailable — rate-limited or RPC error"] }),
  }));
}

// ---------------------------------------------------------------------------
// Resource Commands
// ---------------------------------------------------------------------------

async function cmdResourceInfo({ address }) {
  address = normalizeAddress(address);
  // Fetch resources + account in parallel; the account call gives the frozen (staked)
  // TRX amounts that getaccountresource alone doesn't expose.
  const [data, acctData] = await Promise.all([
    httpPost(`${BASE_URL}/wallet/getaccountresource`, { address, visible: true }),
    httpGet(`${BASE_URL}/v1/accounts/${address}`),
  ]);
  if (apiFailed(data)) return console.log(fmt(unavailable({ address }, data, "Resource info")));

  const freeBwLimit = data.freeNetLimit || 600;
  const freeBwUsed = data.freeNetUsed || 0;
  const stakedBwLimit = data.NetLimit || 0;
  const stakedBwUsed = data.NetUsed || 0;
  const energyLimit = data.EnergyLimit || 0;
  const energyUsed = data.EnergyUsed || 0;

  const acctOk = !apiFailed(acctData) && !!acctData.data?.length;
  const frozenV2 = acctOk ? (acctData.data[0].frozenV2 || []) : [];
  const frozenEnergy = frozenV2.filter(f => f.type === "ENERGY").reduce((s, f) => s + (f.amount || 0), 0);
  const frozenBw = frozenV2.filter(f => f.type !== "ENERGY").reduce((s, f) => s + (f.amount || 0), 0);

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
    staked_trx: acctOk ? {
      frozen_for_energy_trx: sunToTrx(frozenEnergy),
      frozen_for_bandwidth_trx: sunToTrx(frozenBw),
    } : null,
    tips: {
      free_bandwidth_covers: `~${Math.floor((freeBwLimit - freeBwUsed) / 267)} basic TRX transfers`,
      energy_covers: energyLimit > 0
        ? `~${Math.floor((energyLimit - energyUsed) / 65000)} USDT transfers`
        : "0 — no staked energy, TRX will be burned for smart contract calls",
    },
    ...(acctOk ? {} : { data_issues: ["frozen (staked) TRX data unavailable — rate-limited or RPC error"] }),
  }));
}

async function cmdEstimateEnergy({ contract, func, params = "", caller }) {
  const resolved = resolveToken(contract);
  contract = resolved.contract;

  // Fetch the live energy price from chain params in parallel with the estimate,
  // rather than hardcoding 420 SUN (which drifts when TRON governance changes the fee).
  const [data, paramsData] = await Promise.all([
    httpPost(`${BASE_URL}/wallet/triggerconstantcontract`, {
      owner_address: caller,
      contract_address: contract,
      function_selector: func,
      parameter: params,
      visible: true,
    }),
    httpGet(`${BASE_URL}/wallet/getchainparameters`),
  ]);

  if (apiFailed(data)) {
    return console.log(fmt(unavailable({ contract, function: func }, data, "Energy estimate")));
  }
  const energy = data.energy_used || 0;
  const paramsOk = !apiFailed(paramsData);
  let energyPriceSun = 420; // conservative fallback if chain params are unavailable
  if (paramsOk) {
    for (const p of (paramsData.chainParameter || [])) {
      if (p.key === "getEnergyFee") { energyPriceSun = p.value || energyPriceSun; break; }
    }
  }
  const trxCost = (energy * energyPriceSun) / SUN_PER_TRX;

  console.log(fmt({
    contract, function: func,
    estimated_energy: energy,
    energy_price_sun: energyPriceSun,
    energy_price_source: paramsOk ? "live (getEnergyFee)" : "fallback 420 — chain params unavailable, TRX-burn estimate may be off",
    estimated_trx_burn: Math.round(trxCost * 100) / 100,
    note: "TRX burn only applies if you have no staked energy. Freeze TRX to avoid burning.",
    result: data.constant_result || [],
  }));
}

const BANDWIDTH_PRICE_SUN = 1000; // default getTransactionFee; run `bandwidth-price` for the live value

async function cmdEstimateBandwidth({ txSize = 267 }) {
  const freeBw = 600;
  console.log(fmt({
    estimated_bandwidth: txSize,
    free_daily_allowance: freeBw,
    covered_by_free: txSize <= freeBw,
    burn_rate_sun_per_byte: BANDWIDTH_PRICE_SUN,
    trx_burn_if_insufficient: Math.round(txSize * BANDWIDTH_PRICE_SUN / SUN_PER_TRX * 10000) / 10000,
    note: "Offline estimate using the default network rate; run `bandwidth-price` for the live on-chain rate.",
  }));
}

async function cmdEnergyPrice() {
  const params = await httpGet(`${BASE_URL}/wallet/getchainparameters`);
  if (apiFailed(params) || !Array.isArray(params.chainParameter)) {
    return console.log(fmt(unavailable({}, params, "Energy price")));
  }
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

async function cmdBandwidthPrice() {
  const params = await httpGet(`${BASE_URL}/wallet/getchainparameters`);
  if (apiFailed(params)) return console.log(fmt(unavailable({}, params, "Bandwidth price")));
  let bwFee = BANDWIDTH_PRICE_SUN;
  for (const p of (params.chainParameter || [])) {
    if (p.key === "getTransactionFee") { bwFee = p.value ?? bwFee; break; }
  }
  console.log(fmt({
    bandwidth_price_sun_per_byte: bwFee,
    free_daily_bandwidth: 600,
    note: "ALL transactions consume Bandwidth (~proportional to byte size). Each account gets 600 free/day; beyond that TRX is burned at this rate.",
    examples: {
      trx_transfer_267b_trx: Math.round(267 * bwFee / SUN_PER_TRX * 10000) / 10000,
      trc20_transfer_345b_trx: Math.round(345 * bwFee / SUN_PER_TRX * 10000) / 10000,
    },
    network: NETWORK,
  }));
}

// Representative resource footprint for common operations (energy varies with
// contract/state; these are typical averages). Used by `tx-cost`.
const TX_COST_PRESETS = {
  "trx-transfer":            { bandwidth: 267, energy: 0,      desc: "Native TRX transfer" },
  "trc20-transfer":          { bandwidth: 345, energy: 65000,  desc: "TRC-20 transfer to a NEW recipient (e.g. USDT)" },
  "trc20-transfer-existing": { bandwidth: 345, energy: 32000,  desc: "TRC-20 transfer to a recipient that already holds the token" },
  "approve":                 { bandwidth: 345, energy: 30000,  desc: "TRC-20 approve" },
  "swap-v2":                 { bandwidth: 345, energy: 130000, desc: "SunSwap V2 swap" },
  "swap-v3":                 { bandwidth: 345, energy: 150000, desc: "SunSwap V3 swap" },
};

async function cmdTxCost({ type = "trc20-transfer" }) {
  const preset = TX_COST_PRESETS[type];
  if (!preset) {
    return console.log(fmt({ error: `Unknown type '${type}'`, available_types: Object.keys(TX_COST_PRESETS) }));
  }
  const params = await httpGet(`${BASE_URL}/wallet/getchainparameters`);
  if (apiFailed(params)) return console.log(fmt(unavailable({ type }, params, "Chain params")));
  let energyFee = 100, bwFee = BANDWIDTH_PRICE_SUN;
  for (const p of (params.chainParameter || [])) {
    if (p.key === "getEnergyFee") energyFee = p.value ?? energyFee;
    if (p.key === "getTransactionFee") bwFee = p.value ?? bwFee;
  }
  const energyBurn = preset.energy * energyFee / SUN_PER_TRX;
  const bandwidthBurn = preset.bandwidth * bwFee / SUN_PER_TRX;
  console.log(fmt({
    type,
    description: preset.desc,
    bandwidth_needed: preset.bandwidth,
    energy_needed: preset.energy,
    live_energy_price_sun: energyFee,
    live_bandwidth_price_sun: bwFee,
    cost_if_no_resources_trx: Math.round((energyBurn + bandwidthBurn) * 100) / 100,
    breakdown: {
      energy_burn_trx: Math.round(energyBurn * 100) / 100,
      bandwidth_burn_trx: Math.round(bandwidthBurn * 10000) / 10000,
    },
    cost_with_staked_resources_trx: 0,
    note: "If you have free daily bandwidth (600) or staked Energy/Bandwidth, the matching portion is 0. Energy figures are representative averages.",
    network: NETWORK,
  }));
}

async function cmdChainParams() {
  const params = await httpGet(`${BASE_URL}/wallet/getchainparameters`);
  if (apiFailed(params) || !Array.isArray(params.chainParameter)) {
    return console.log(fmt(unavailable({}, params, "Chain parameters")));
  }
  const labels = {
    getEnergyFee: "energy_price_sun",
    getTransactionFee: "bandwidth_price_sun_per_byte",
    getCreateNewAccountFeeInSystemContract: "create_account_fee_sun",
    getCreateAccountFee: "create_account_bandwidth_sun",
    getMemoFee: "memo_fee_sun",
    getMaxFeeLimit: "max_fee_limit_sun",
    getWitnessPayPerBlock: "sr_block_reward_sun",
    getTotalEnergyCurrentLimit: "network_energy_limit",
  };
  const raw = {};
  const key_parameters = {};
  for (const p of params.chainParameter) {
    raw[p.key] = p.value;
    if (labels[p.key]) key_parameters[labels[p.key]] = p.value;
  }
  console.log(fmt({
    key_parameters,
    derived: {
      energy_price_trx_per_10k: key_parameters.energy_price_sun != null
        ? Math.round(key_parameters.energy_price_sun * 10000 / SUN_PER_TRX * 10000) / 10000 : null,
      create_account_fee_trx: key_parameters.create_account_fee_sun != null
        ? key_parameters.create_account_fee_sun / SUN_PER_TRX : null,
      max_fee_limit_trx: key_parameters.max_fee_limit_sun != null
        ? key_parameters.max_fee_limit_sun / SUN_PER_TRX : null,
    },
    total_parameters_available: Object.keys(raw).length,
    network: NETWORK,
  }));
}


async function cmdEnergyRental({ amount = 65000 }) {
  // Energy is a whole-unit resource — decimals are rejected upstream by the numeric
  // validator (int constraint), so by here `amount` is an integer. Parse once and
  // use the same value everywhere so `energy_needed` and `tip` never disagree.
  const energy = parseInt(amount, 10);
  console.log(fmt({
    energy_needed: energy,
    rental_platforms: [
      { name: "TronNRG", url: "https://tronnrg.com", description: "Community energy marketplace" },
      { name: "JustLend", url: "https://justlend.org", description: "Official TRON lending + energy rental" },
      { name: "Feee.io", url: "https://feee.io", description: "Energy rental service" },
    ],
    tip: `For ${energy} energy, compare rental price vs. freezing TRX vs. burning TRX.`,
  }));
}

async function cmdOptimizeCost({ address }) {
  address = normalizeAddress(address);

  const [resourceData, accountData, paramsData] = await Promise.all([
    httpPost(`${BASE_URL}/wallet/getaccountresource`, { address, visible: true }),
    httpGet(`${BASE_URL}/v1/accounts/${address}`),
    httpGet(`${BASE_URL}/wallet/getchainparameters`),
  ]);

  // The advice is personalized to balance + energy; with either missing it would be
  // wrong (e.g. recommend freezing based on a fake 0 balance), so bail rather than guess.
  if (apiFailed(accountData) || apiFailed(resourceData)) {
    return console.log(fmt(unavailable({ address }, apiFailed(accountData) ? accountData : resourceData, "Cost optimization")));
  }

  const energyLimit = resourceData.EnergyLimit || 0;
  const balance = accountData.data?.[0]?.balance || 0;
  const trxBalance = sunToTrx(balance);

  const paramsOk = !apiFailed(paramsData);
  let energyFee = 420; // conservative fallback if chain params are unavailable
  if (paramsOk) {
    for (const p of (paramsData.chainParameter || [])) {
      if (p.key === "getEnergyFee") { energyFee = p.value || energyFee; break; }
    }
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
    energy_price_sun: energyFee,
    energy_price_source: paramsOk
      ? "live (getEnergyFee)"
      : "fallback 420 — chain params unavailable, the TRX cost figures below may be overestimated",
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
        monthly_savings_at_1_tx_per_day: `~${(usdtBurn * 30).toFixed(1)} TRX`,
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
  if (apiFailed(data) || !Array.isArray(data.data)) {
    return console.log(fmt(unavailable({}, data, "SR list")));
  }
  // TronScan's vote/witness ignores `limit` (always returns all ~438), so slice here.
  const srs = data.data.slice(0, limit).map(w => ({
    rank: w.realTimeRanking || 0, name: w.name || "Unknown",
    address: w.address || "",
    total_votes: w.realTimeVotes || 0,
    vote_percentage: w.votesPercentage || 0,
    commission_pct: w.brokerage ?? null,
    blocks_produced: w.producedTotal || 0,
    efficiency: w.producedEfficiency || 0,
    annualized_rate: w.annualizedRate || 0,
    url: w.url || "",
  }));
  console.log(fmt({ super_representatives: srs, count: srs.length, total_available: data.data.length }));
}

async function cmdStakingInfo({ address }) {
  address = normalizeAddress(address);
  const accountData = await httpGet(`${BASE_URL}/v1/accounts/${address}`);
  // Distinguish a rate-limit/RPC error from a genuinely missing account.
  if (apiFailed(accountData)) return console.log(fmt(unavailable({ address }, accountData, "Staking info")));
  if (!accountData.data?.length) return console.log(fmt({ address, error: "Account not found or not activated" }));

  const acct = accountData.data[0];
  const [rewardData, delegIndex] = await Promise.all([
    httpPost(`${BASE_URL}/wallet/getReward`, { address, visible: true }),
    httpPost(`${BASE_URL}/wallet/getdelegatedresourceaccountindexv2`, { value: address, visible: true }),
  ]);
  const rewardOk = !apiFailed(rewardData);
  const delegOk = !apiFailed(delegIndex);
  const issues = [];
  if (!rewardOk) issues.push("unclaimed reward data unavailable (rate-limited or RPC error)");
  if (!delegOk) issues.push("delegation data unavailable (rate-limited or RPC error)");

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
    unclaimed_reward_sun: rewardOk ? (rewardData.reward || 0) : null,
    unclaimed_reward_trx: rewardOk ? sunToTrx(rewardData.reward || 0) : null,
    delegated_resources: delegOk ? {
      to_addresses: delegIndex.toAccounts || [],
      from_addresses: delegIndex.fromAccounts || [],
      note: "addresses this account delegated resources TO / received FROM; per-pair amounts need getdelegatedresourcev2",
    } : null,
    ...(issues.length ? { data_issues: issues } : {}),
  }));
}

async function cmdStakingApy({ amount = "10000" }) {
  const amountNum = Math.max(0, parseFloat(amount) || 0); // clamp: negative/NaN stake makes no sense
  const data = await httpGet(`${TRONSCAN_API}/vote/witness`, { limit: 5 });
  if (apiFailed(data) || !data.data?.[0]) {
    return console.log(fmt(unavailable({ staking_amount_trx: amountNum }, data, "Staking APY data")));
  }
  const topSr = data.data[0];
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
// Composite / Diagnostics Commands
// ---------------------------------------------------------------------------

async function cmdHealthCheck() {
  const probes = [
    { label: "TronGrid (chain RPC)", run: async () => {
        const d = await httpGet(`${BASE_URL}/wallet/getnowblock`);
        return { ok: !apiFailed(d) && !!d.blockID, detail: d.blockID ? `block ${d.block_header?.raw_data?.number ?? "?"}` : (d.error || "no block") };
      } },
    { label: "TronScan API", run: async () => {
        const d = await httpGet(`${TRONSCAN_API}/system/status`);
        return { ok: !apiFailed(d) && !!(d.database || d.full), detail: apiFailed(d) ? (d.error || "fail") : "ok" };
      } },
    { label: "CoinGecko (prices)", run: async () => {
        const d = await httpGet(`${COINGECKO_API}/ping`);
        return { ok: !apiFailed(d) && !!d.gecko_says, detail: apiFailed(d) ? (d.error || "fail") : "ok" };
      } },
    { label: "Sun.io Router (swap)", run: async () => {
        const d = await httpGet(`${SWAP_ROUTER_BASE}/swap/router`, {
          fromToken: KNOWN_TOKENS.WTRX.contract, toToken: KNOWN_TOKENS.USDT.contract,
          amountIn: "1000000", typeList: "SUNSWAP_V2",
        });
        return { ok: !apiFailed(d) && Array.isArray(d.data), detail: apiFailed(d) ? (d.error || "fail") : "ok" };
      } },
  ];
  const services = await Promise.all(probes.map(async p => {
    const start = Date.now();
    let r;
    try { r = await p.run(); } catch (e) { r = { ok: false, detail: e.message }; }
    return { service: p.label, ok: r.ok, detail: r.detail, latency_ms: Date.now() - start };
  }));
  const healthy = services.filter(s => s.ok).length;
  console.log(fmt({
    node_version: process.version,
    network: NETWORK,
    trongrid_api_key: TRONGRID_API_KEY ? "set" : "not set (public rate limits apply)",
    services,
    summary: `${healthy}/${services.length} healthy`,
    status: healthy === services.length ? "OK" : healthy === 0 ? "DOWN" : "DEGRADED",
  }));
}

async function cmdWalletOverview({ address }) {
  address = normalizeAddress(address);
  const [acctData, resourceData, rewardData] = await Promise.all([
    httpGet(`${BASE_URL}/v1/accounts/${address}`),
    httpPost(`${BASE_URL}/wallet/getaccountresource`, { address, visible: true }),
    httpPost(`${BASE_URL}/wallet/getReward`, { address, visible: true }),
  ]);
  if (apiFailed(acctData)) return console.log(fmt(unavailable({ address }, acctData, "Wallet overview")));
  if (!acctData.data?.length) {
    return console.log(fmt({ address, error: "Account not found — needs at least 1 TRX to activate.", network: NETWORK }));
  }
  const acct = acctData.data[0];

  // Only scale balances for tokens whose decimals we know — defaulting unknown
  // tokens to 6 decimals would massively inflate 18-decimal balances. Unknown
  // tokens are counted, not shown with a fabricated amount.
  const knownHoldings = [];
  let unknownTokenCount = 0;
  for (const tokenMap of (acct.trc20 || [])) {
    for (const [addr, rawBal] of Object.entries(tokenMap)) {
      if (parseInt(rawBal) <= 0) continue;
      let known = null;
      for (const v of Object.values(KNOWN_TOKENS)) { if (v.contract === addr) { known = v; break; } }
      if (known) knownHoldings.push({ symbol: known.symbol, contract: addr, balance: parseInt(rawBal) / (10 ** known.decimals) });
      else unknownTokenCount++;
    }
  }
  knownHoldings.sort((a, b) => b.balance - a.balance);

  const frozenV2 = acct.frozenV2 || [];
  const frozenEnergy = frozenV2.filter(f => f.type === "ENERGY").reduce((s, f) => s + (f.amount || 0), 0);
  const frozenBw = frozenV2.filter(f => f.type !== "ENERGY").reduce((s, f) => s + (f.amount || 0), 0);
  // Secondary calls can fail independently of the account fetch — report those
  // sections as null + a data_issues note rather than as real 0 / no-reward.
  const resourcesOk = !apiFailed(resourceData);
  const rewardOk = !apiFailed(rewardData);
  const issues = [];
  if (!resourcesOk) issues.push("Energy/Bandwidth resource data unavailable (rate-limited or RPC error)");
  if (!rewardOk) issues.push("staking reward data unavailable (rate-limited or RPC error)");
  const freeBwLimit = resourceData.freeNetLimit || 600, freeBwUsed = resourceData.freeNetUsed || 0;
  const energyLimit = resourceData.EnergyLimit || 0, energyUsed = resourceData.EnergyUsed || 0;

  console.log(fmt({
    address,
    trx_balance: sunToTrx(acct.balance || 0),
    trc20_token_count: knownHoldings.length + unknownTokenCount,
    known_holdings: knownHoldings.slice(0, 10),
    unknown_token_count: unknownTokenCount,
    resources: resourcesOk ? {
      energy_remaining: energyLimit - energyUsed,
      energy_total: energyLimit,
      free_bandwidth_remaining: freeBwLimit - freeBwUsed,
      free_bandwidth_total: freeBwLimit,
    } : null,
    staking: {
      frozen_for_energy_trx: sunToTrx(frozenEnergy),
      frozen_for_bandwidth_trx: sunToTrx(frozenBw),
      vote_count: (acct.votes || []).length,
      unclaimed_reward_trx: rewardOk ? sunToTrx(rewardData.reward || 0) : null,
      pending_unfreezes: (acct.unfrozenV2 || []).length,
    },
    created: acct.create_time ? new Date(acct.create_time).toISOString() : null,
    network: NETWORK,
    ...(issues.length ? { data_issues: issues } : {}),
  }));
}

async function cmdTokenOverview({ contract }) {
  if (isNativeTrx(contract)) return console.log(fmt(TRX_NATIVE_HINT));
  const resolved = resolveToken(contract);
  contract = resolved.contract;
  const [tokenData, holderData, contractData] = await Promise.all([
    httpGet(`${TRONSCAN_API}/token_trc20`, { contract }),
    httpGet(`${TRONSCAN_API}/token_trc20/holders`, { contract_address: contract, limit: 5, start: 0 }),
    httpGet(`${TRONSCAN_API}/contract`, { contract }),
  ]);
  if (apiFailed(tokenData) || !tokenData.trc20_tokens?.[0]) {
    return console.log(fmt(unavailable({ contract }, tokenData, "Token overview")));
  }
  // The holders + contract calls can fail independently of the token fetch.
  // When they do, report verification/concentration as unknown (null) rather than
  // as "unverified"/0, and mark the risk verdict INCONCLUSIVE.
  const contractOk = !apiFailed(contractData);
  const holderOk = !apiFailed(holderData);
  const t = tokenData.trc20_tokens[0];
  const mi = t.market_info || {};
  const c = contractData.data?.[0] || {};
  const decimals = parseInt(t.decimals || 0);
  const totalSupplyRaw = parseFloat(t.total_supply_with_decimals || 0);
  const holders = (holderOk && holderData.rangeTotal) || t.holders_count || 0;
  const top5 = holderOk ? (holderData.trc20_tokens || []).slice(0, 5).reduce((s, h) => s + parseFloat(h.balance || 0), 0) : 0;
  const top5Pct = (holderOk && totalSupplyRaw > 0) ? (top5 / totalSupplyRaw) * 100 : null;
  const verified = contractOk ? Boolean(c.verify_status) : null;
  const cautious = (top5Pct != null && top5Pct > 80) || verified === false || holders < 100;
  const issues = [];
  if (!contractOk) issues.push("contract verification data unavailable — 'verified' is unknown, not false");
  if (!holderOk) issues.push("holder data unavailable — concentration may be incomplete");

  console.log(fmt({
    contract,
    name: t.name || "Unknown",
    symbol: t.symbol || "Unknown",
    decimals,
    price_usd: mi.priceInUsd || t.price || null,
    market_cap_usd: t.market_cap_usd || null,
    volume_24h_trx: mi.volume24hInTrx || null,
    change_24h_pct: mi.gain ?? null,
    holders,
    total_supply: totalSupplyRaw ? totalSupplyRaw / (10 ** decimals) : null,
    security: {
      verified,
      top5_concentration_pct: top5Pct != null ? Math.round(top5Pct * 100) / 100 : null,
      risk: cautious ? "⚠️ CAUTION" : (issues.length ? "⚠️ INCONCLUSIVE — some checks unavailable" : "✅ relatively safe"),
      note: "Heuristic snapshot only (verification + concentration + holder count) — not a full audit. DYOR.",
    },
    network: NETWORK,
    ...(issues.length ? { data_issues: issues } : {}),
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
  "wallet-approvals":  { opts: { address: { type: "string" }, limit: { type: "string", default: "50" } }, required: ["address"], handler: (a) => cmdWalletApprovals({ ...a, limit: parseInt(a.limit) }) },
  "wallet-overview":   { opts: { address: { type: "string" } }, required: ["address"], handler: cmdWalletOverview },

  // Token
  "token-info":        { opts: { contract: { type: "string" } }, required: ["contract"], handler: cmdTokenInfo },
  "token-search":      { opts: { keyword: { type: "string" } }, required: ["keyword"], handler: cmdTokenSearch },
  "contract-info":     { opts: { contract: { type: "string" } }, required: ["contract"], handler: cmdContractInfo },
  "token-holders":     { opts: { contract: { type: "string" }, limit: { type: "string", default: "20" } }, required: ["contract"], handler: (a) => cmdTokenHolders({ ...a, limit: parseInt(a.limit) }) },
  "trending-tokens":   { opts: {}, required: [], handler: cmdTrendingTokens },
  "token-rankings":    { opts: { "sort-by": { type: "string", default: "market_cap" } }, required: [], handler: (a) => cmdTokenRankings({ sortBy: a["sort-by"] }) },
  "token-security":    { opts: { contract: { type: "string" } }, required: ["contract"], handler: cmdTokenSecurity },
  "token-overview":    { opts: { contract: { type: "string" } }, required: ["contract"], handler: cmdTokenOverview },

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
  "swap-quote":        { opts: { "from-token": { type: "string" }, "to-token": { type: "string" }, amount: { type: "string" }, slippage: { type: "string", default: "0.5" } }, required: ["from-token", "to-token", "amount"], handler: (a) => cmdSwapQuote({ fromToken: a["from-token"], toToken: a["to-token"], amount: a.amount, slippage: parseFloat(a.slippage) }) },
  "swap-route":        { opts: { "from-token": { type: "string" }, "to-token": { type: "string" }, amount: { type: "string" }, slippage: { type: "string", default: "0.5" } }, required: ["from-token", "to-token", "amount"], handler: (a) => cmdSwapQuote({ fromToken: a["from-token"], toToken: a["to-token"], amount: a.amount, slippage: parseFloat(a.slippage) }) },
  "tx-status":         { opts: { txid: { type: "string" } }, required: ["txid"], handler: cmdTxStatus },

  // Resource
  "resource-info":     { opts: { address: { type: "string" } }, required: ["address"], handler: cmdResourceInfo },
  "estimate-energy":   { opts: { contract: { type: "string" }, function: { type: "string" }, params: { type: "string", default: "" }, caller: { type: "string" } }, required: ["contract", "function", "caller"], handler: (a) => cmdEstimateEnergy({ contract: a.contract, func: a.function, params: a.params, caller: a.caller }) },
  "estimate-bandwidth":{ opts: { "tx-size": { type: "string", default: "267" } }, required: [], handler: (a) => cmdEstimateBandwidth({ txSize: parseInt(a["tx-size"]) }) },
  "energy-price":      { opts: {}, required: [], handler: cmdEnergyPrice },
  "bandwidth-price":   { opts: {}, required: [], handler: cmdBandwidthPrice },
  "tx-cost":           { opts: { type: { type: "string", default: "trc20-transfer" } }, required: [], handler: cmdTxCost },
  "chain-params":      { opts: {}, required: [], handler: cmdChainParams },
  "energy-rental":     { opts: { amount: { type: "string", default: "65000" } }, required: [], handler: cmdEnergyRental },
  "optimize-cost":     { opts: { address: { type: "string" } }, required: ["address"], handler: cmdOptimizeCost },

  // Staking
  "sr-list":           { opts: { limit: { type: "string", default: "30" } }, required: [], handler: (a) => cmdSrList({ limit: parseInt(a.limit) }) },
  "staking-info":      { opts: { address: { type: "string" } }, required: ["address"], handler: cmdStakingInfo },
  "staking-apy":       { opts: { amount: { type: "string", default: "10000" } }, required: [], handler: cmdStakingApy },

  // Diagnostics
  "health-check":      { opts: {}, required: [], handler: cmdHealthCheck },
};

// ---------------------------------------------------------------------------
// Unified numeric-option validation
// ---------------------------------------------------------------------------
// Centralized so every command rejects negative / zero / non-numeric / oversized
// numeric input the same way, instead of silently passing garbage to upstream
// APIs (e.g. `sr-list --limit -1` returning the whole list, or `tx-size -1`
// producing a negative fee). Constraint keys: int (whole number), gt (exclusive
// lower bound), min/max (inclusive bounds).
const NUMERIC_OPTS = {
  "tx-history":         { limit: { int: true, min: 1, max: 200 } },
  "wallet-approvals":   { limit: { int: true, min: 1, max: 200 } },
  "token-holders":      { limit: { int: true, min: 1, max: 200 } },
  "kline":              { limit: { int: true, min: 1, max: 1000 } },
  "trade-history":      { limit: { int: true, min: 1, max: 200 } },
  "whale-transfers":    { "min-value": { min: 0 } },
  "large-transfers":    { "min-trx": { min: 0 }, limit: { int: true, min: 1, max: 200 } },
  "swap-quote":         { amount: { gt: 0 }, slippage: { min: 0, max: 50 } },
  "swap-route":         { amount: { gt: 0 }, slippage: { min: 0, max: 50 } },
  "estimate-bandwidth": { "tx-size": { int: true, min: 1, max: 1000000 } },
  "energy-rental":      { amount: { int: true, min: 1 } },
  "sr-list":            { limit: { int: true, min: 1, max: 200 } },
  "staking-apy":        { amount: { gt: 0 } },
};

function validateNumber(raw, name, spec) {
  const s = String(raw).trim();
  const n = Number(s);
  if (s === "" || !Number.isFinite(n)) return `--${name} must be a number (got "${raw}")`;
  if (spec.int && !Number.isInteger(n)) return `--${name} must be a whole number (got "${raw}")`;
  if (spec.gt !== undefined && n <= spec.gt) return `--${name} must be greater than ${spec.gt} (got ${n})`;
  if (spec.min !== undefined && n < spec.min) return `--${name} must be >= ${spec.min} (got ${n})`;
  if (spec.max !== undefined && n > spec.max) return `--${name} must be <= ${spec.max} (got ${n})`;
  return null;
}

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
    wallet-approvals    --address <ADDR> [--limit 50]
    wallet-overview     --address <ADDR>

  Token:
    token-info          --contract <TOKEN>
    token-search        --keyword <KEYWORD>
    contract-info       --contract <TOKEN>
    token-holders       --contract <TOKEN> [--limit N]
    trending-tokens
    token-rankings      [--sort-by market_cap|volume|holders|gainers|losers]
    token-security      --contract <TOKEN>
    token-overview      --contract <TOKEN>

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
    swap-quote          --from-token <TOKEN> --to-token <TOKEN> --amount <N> [--slippage 0.5]
    swap-route          --from-token <TOKEN> --to-token <TOKEN> --amount <N> [--slippage 0.5]
    tx-status           --txid <HASH>

  Resource:
    resource-info       --address <ADDR>
    estimate-energy     --contract <TOKEN> --function <SIG> --caller <ADDR> [--params <P>]
    estimate-bandwidth  [--tx-size 267]
    energy-price
    bandwidth-price
    tx-cost             [--type trc20-transfer|trx-transfer|approve|swap-v2|swap-v3|...]
    chain-params
    energy-rental       [--amount 65000]
    optimize-cost       --address <ADDR>

  Staking:
    sr-list             [--limit 30]
    staking-info        --address <ADDR>
    staking-apy         [--amount 10000]

  Diagnostics:
    health-check        (checks upstream API reachability + latency)

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

  // Validate numeric options uniformly. On failure, print the standard
  // { error, status } envelope to stdout and exit 0 — so MCP (which reads stdout)
  // surfaces the structured message instead of a generic "command failed".
  const numSpecs = NUMERIC_OPTS[command];
  if (numSpecs) {
    for (const [optName, spec] of Object.entries(numSpecs)) {
      const raw = parsed.values[optName];
      if (raw === undefined) continue;
      const err = validateNumber(raw, optName, spec);
      if (err) {
        console.log(fmt({ error: err, status: 400, parameter: optName }));
        return;
      }
    }
  }

  await cmdDef.handler(parsed.values);
}

// Run the CLI only when invoked directly (e.g. `node tron_api.mjs ...` or via the
// MCP server's execFile). When imported (e.g. by the test suite) main() is NOT run,
// so the pure helpers below can be unit-tested in isolation.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(e => {
    console.error(`Fatal error: ${e.message}`);
    process.exit(1);
  });
}

export {
  b58decode,
  b58encode,
  sha256,
  isValidTronAddress,
  hexToBase58,
  normalizeAddress,
  resolveToken,
  sunToTrx,
  trxToSun,
  KNOWN_TOKENS,
  parseJsonResponse,
  apiFailed,
  TX_COST_PRESETS,
  validateNumber,
  NUMERIC_OPTS,
  isNativeTrx,
};
