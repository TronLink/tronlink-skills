// Unit tests for the pure (offline, no-network) helpers in tron_api.mjs.
// Run with: node --test test/
//
// These import tron_api.mjs directly — which is safe because the CLI only runs
// when the module is invoked directly (the import.meta.url guard), so importing
// it here does NOT execute any command or hit the network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  isValidTronAddress,
  normalizeAddress,
  resolveToken,
  sunToTrx,
  trxToSun,
  hexToBase58,
  b58decode,
  b58encode,
  KNOWN_TOKENS,
  parseJsonResponse,
  apiFailed,
  TX_COST_PRESETS,
  validateNumber,
  NUMERIC_OPTS,
  isNativeTrx,
} from "../scripts/tron_api.mjs";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const SAMPLE = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";

test("isValidTronAddress accepts well-known mainnet addresses", () => {
  assert.equal(isValidTronAddress(USDT), true);
  assert.equal(isValidTronAddress(SAMPLE), true);
  for (const t of Object.values(KNOWN_TOKENS)) {
    if (t.contract === "TRX") continue;
    assert.equal(isValidTronAddress(t.contract), true, `${t.symbol} should be valid`);
  }
});

test("isValidTronAddress rejects malformed input", () => {
  assert.equal(isValidTronAddress("TtotallyBogusAddress"), false); // wrong length
  assert.equal(isValidTronAddress(USDT.slice(0, -1) + "X"), false); // broken checksum
  assert.equal(isValidTronAddress("0x1234"), false);               // not base58 T
  assert.equal(isValidTronAddress(""), false);
  assert.equal(isValidTronAddress(null), false);
});

test("base58 decode/encode round-trips", () => {
  assert.equal(b58encode(b58decode(USDT)), USDT);
  assert.equal(b58encode(b58decode(SAMPLE)), SAMPLE);
});

test("hexToBase58 produces a checksum-valid TRON address", () => {
  const hex = "41" + "00".repeat(20); // 0x41 + 20 zero bytes = all-zero account
  const b58 = hexToBase58(hex);
  assert.equal(b58.startsWith("T"), true);
  assert.equal(isValidTronAddress(b58), true);
});

test("normalizeAddress leaves base58 untouched and converts hex", () => {
  assert.equal(normalizeAddress(USDT), USDT);
  const hex = "41" + "00".repeat(20);
  assert.equal(normalizeAddress(hex), hexToBase58(hex));
  // 0x-prefixed hex form
  assert.equal(normalizeAddress("0x" + "00".repeat(20)), hexToBase58(hex));
});

test("resolveToken maps known symbols and passes through unknowns", () => {
  assert.equal(resolveToken("usdt").contract, USDT);
  assert.equal(resolveToken("USDT").symbol, "USDT");
  assert.equal(resolveToken("USDT").decimals, 6);
  assert.equal(resolveToken("TRX").contract, "TRX");
  // unknown input is returned as its own contract
  const unknown = resolveToken("TSomeUnknownContractAddrXXXXXXXXXXX");
  assert.equal(unknown.contract, "TSomeUnknownContractAddrXXXXXXXXXXX");
  assert.equal(unknown.name, "Unknown");
});

test("expanded token aliases resolve (USDD 2.0 / TUSD / USDJ / APENFT)", () => {
  assert.equal(resolveToken("USDD").contract, "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz");
  assert.equal(resolveToken("usdd").decimals, 18);
  assert.equal(resolveToken("TUSD").contract, "TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4");
  assert.equal(resolveToken("USDJ").decimals, 18);
  // APENFT and its on-chain "NFT" symbol point at the same contract
  assert.equal(resolveToken("APENFT").contract, "TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq");
  assert.equal(resolveToken("NFT").contract, resolveToken("APENFT").contract);
  assert.equal(resolveToken("APENFT").decimals, 6);
});

test("sun/trx conversions are inverse and correct", () => {
  assert.equal(sunToTrx(1_000_000), 1);
  assert.equal(trxToSun(1), 1_000_000);
  assert.equal(trxToSun(sunToTrx(123_456_789)), 123_456_789);
});

test("parseJsonResponse: 2xx JSON passes through unchanged", async () => {
  const resp = new Response(JSON.stringify({ trc20_tokens: [{ symbol: "USDT" }] }), { status: 200 });
  const data = await parseJsonResponse(resp);
  assert.equal(data.trc20_tokens[0].symbol, "USDT");
  assert.equal(apiFailed(data), false);
});

test("parseJsonResponse: 429 rate-limit is an error even with a JSON body", async () => {
  // This is the exact rate-limit case: TronScan returns a valid-JSON 429.
  const resp = new Response(JSON.stringify({ message: "rate limit exceeded" }), { status: 429 });
  const data = await parseJsonResponse(resp);
  assert.equal(apiFailed(data), true, "must be flagged as a failure, not usable data");
  assert.equal(data.status, 429);
  assert.match(data.error, /HTTP 429/);
});

test("parseJsonResponse: 5xx and non-JSON bodies are errors", async () => {
  const gw = await parseJsonResponse(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
  assert.equal(apiFailed(gw), true);
  assert.equal(gw.status, 502);

  const htmlOk = await parseJsonResponse(new Response("<html>not json</html>", { status: 200 }));
  assert.equal(apiFailed(htmlOk), true, "200 with HTML body is still unusable");
});

test("apiFailed distinguishes error envelopes from real data", () => {
  assert.equal(apiFailed({ error: "boom" }), true);
  assert.equal(apiFailed(null), true);
  assert.equal(apiFailed("string"), true);
  assert.equal(apiFailed({ trc20_tokens: [] }), false); // empty-but-valid
  assert.equal(apiFailed([]), false);                    // valid empty array
});

test("every multi-call handler guards partial failures (no silent 0/defaults)", () => {
  // Static guard so a new command that makes 2+ API calls can't reintroduce the
  // "secondary call fails -> show default 0/Unknown" bug without a guard token.
  const src = readFileSync(fileURLToPath(new URL("../scripts/tron_api.mjs", import.meta.url)), "utf8");
  const parts = src.split(/async function (cmd\w+)/).slice(1);
  const unguarded = [];
  for (let i = 0; i < parts.length; i += 2) {
    const name = parts[i];
    const body = parts[i + 1].split(/\nasync function|\nconst COMMANDS/)[0];
    const calls = (body.match(/httpGet|httpPost/g) || []).length;
    if (calls >= 2) {
      const guarded = /apiFailed|data_issues|\bOk\b/.test(body);
      if (!guarded) unguarded.push(`${name} (${calls} calls)`);
    }
  }
  assert.deepEqual(unguarded, [], `multi-call handlers missing partial-failure guards: ${unguarded.join(", ")}`);
});

test("tx-cost presets are well-formed and self-consistent", () => {
  for (const [name, p] of Object.entries(TX_COST_PRESETS)) {
    assert.equal(typeof p.bandwidth, "number", `${name}.bandwidth`);
    assert.equal(typeof p.energy, "number", `${name}.energy`);
    assert.ok(p.bandwidth > 0, `${name} needs bandwidth`);
    assert.ok(typeof p.desc === "string" && p.desc.length > 0, `${name}.desc`);
  }
  // sanity: a native TRX transfer uses no energy; a TRC-20 transfer does
  assert.equal(TX_COST_PRESETS["trx-transfer"].energy, 0);
  assert.ok(TX_COST_PRESETS["trc20-transfer"].energy > 0);
  // worked example math: 65000 energy * 100 SUN / 1e6 = 6.5 TRX
  assert.equal(TX_COST_PRESETS["trc20-transfer"].energy * 100 / 1_000_000, 6.5);
});

test("validateNumber rejects non-numeric, negative, zero, and out-of-range input", () => {
  // non-numeric
  assert.match(validateNumber("abc", "amount", { gt: 0 }), /must be a number/);
  assert.match(validateNumber("", "amount", { gt: 0 }), /must be a number/);
  assert.match(validateNumber("30abc", "limit", { int: true, min: 1 }), /must be a number/);
  // gt (exclusive lower bound): zero and negatives rejected
  assert.match(validateNumber("0", "amount", { gt: 0 }), /greater than 0/);
  assert.match(validateNumber("-5", "amount", { gt: 0 }), /greater than 0/);
  // min (inclusive) and integer-ness
  assert.match(validateNumber("-1", "limit", { int: true, min: 1 }), />= 1/);
  assert.match(validateNumber("1.5", "limit", { int: true, min: 1 }), /whole number/);
  // max (e.g. slippage)
  assert.match(validateNumber("200", "slippage", { min: 0, max: 50 }), /<= 50/);
});

test("validateNumber accepts valid input (returns null)", () => {
  assert.equal(validateNumber("30", "limit", { int: true, min: 1, max: 200 }), null);
  assert.equal(validateNumber("1", "limit", { int: true, min: 1 }), null);   // boundary
  assert.equal(validateNumber("0.5", "slippage", { min: 0, max: 50 }), null);
  assert.equal(validateNumber("50", "slippage", { min: 0, max: 50 }), null);  // boundary
  assert.equal(validateNumber("0", "min-value", { min: 0 }), null);           // threshold allows 0
  assert.equal(validateNumber("1000", "amount", { gt: 0 }), null);
});

test("isNativeTrx detects native TRX case-insensitively, not TRC-20 contracts", () => {
  assert.equal(isNativeTrx("TRX"), true);
  assert.equal(isNativeTrx("trx"), true);
  assert.equal(isNativeTrx(" Trx "), true);
  assert.equal(isNativeTrx(USDT), false);
  assert.equal(isNativeTrx("TRXyz123"), false);
  assert.equal(isNativeTrx(undefined), false);
});

test("energy-rental requires a whole-number energy amount (no silent truncation)", () => {
  assert.deepEqual(NUMERIC_OPTS["energy-rental"], { amount: { int: true, min: 1 } });
  assert.match(validateNumber("0.1", "amount", NUMERIC_OPTS["energy-rental"].amount), /whole number/);
  assert.match(validateNumber("65000.9", "amount", NUMERIC_OPTS["energy-rental"].amount), /whole number/);
  assert.equal(validateNumber("65000", "amount", NUMERIC_OPTS["energy-rental"].amount), null);
});

test("NUMERIC_OPTS covers every command that parses a numeric option", () => {
  // Guard against a new numeric flag being added without validation. swap amount,
  // slippage, all limits, tx-size, min-value/min-trx must each carry a spec.
  for (const cmd of ["sr-list", "estimate-bandwidth", "energy-rental", "swap-quote",
                     "swap-route", "whale-transfers", "large-transfers", "staking-apy",
                     "tx-history", "token-holders", "kline", "trade-history"]) {
    assert.ok(NUMERIC_OPTS[cmd], `${cmd} should have numeric validation`);
  }
  assert.deepEqual(NUMERIC_OPTS["swap-quote"], { amount: { gt: 0 }, slippage: { min: 0, max: 50 } });
});
