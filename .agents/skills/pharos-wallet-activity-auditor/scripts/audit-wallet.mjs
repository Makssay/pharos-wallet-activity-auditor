#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function usage() {
  return `Pharos Wallet Activity Auditor

Usage:
  node scripts/audit-wallet.mjs --address <0xaddr[,0xaddr...]> [options]

Options:
  --address <value>          Required. Repeatable; comma-separated values are accepted.
  --addresses-file <path>    Read wallet addresses from a .txt or .csv file.
  --network <name>           atlantic-testnet or mainnet. Defaults to config default.
  --compare-networks         Audit every configured Pharos network for each address.
  --format <markdown|json|csv|console>
                             Output format. Default: markdown, inferred from --output extension when omitted.
  --output <path>            Write the report to a file instead of stdout.
  --no-color                 Disable ANSI colors in console output.
  --rpc-url <url>            Override RPC URL.
  --max-txs <n>              Explorer transaction history size. Default: 5.
  --explorer-api-key <key>   SocialScan API key. Also reads SOCIALSCAN_API_KEY.
  --include-zero-tokens      Include known tokens with zero balances.
  --no-explorer              Skip optional explorer transaction history.
  --timeout-ms <n>           Per-request timeout. Default: 15000.
  --token-delay-ms <n>       Delay between token calls. Default: 200.
  --help                     Show this help.
`;
}

function parseArgs(argv) {
  const opts = {
    addresses: [],
    addressesFile: null,
    network: null,
    compareNetworks: false,
    format: "markdown",
    formatProvided: false,
    output: null,
    color: process.stdout.isTTY && !process.env.NO_COLOR,
    rpcUrl: null,
    explorerApiKey: process.env.SOCIALSCAN_API_KEY || null,
    maxTxs: 5,
    includeZeroTokens: false,
    explorer: true,
    timeoutMs: 15000,
    tokenDelayMs: 200
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--address" || arg === "--addresses") {
      const value = argv[++i];
      if (!value) throw new Error("--address requires a value");
      opts.addresses.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
    } else if (arg === "--addresses-file") {
      opts.addressesFile = argv[++i];
      if (!opts.addressesFile) throw new Error("--addresses-file requires a value");
    } else if (arg === "--network") {
      opts.network = argv[++i];
      if (!opts.network) throw new Error("--network requires a value");
    } else if (arg === "--compare-networks") {
      opts.compareNetworks = true;
    } else if (arg === "--format") {
      opts.format = argv[++i];
      opts.formatProvided = true;
      if (!["markdown", "json", "csv", "console"].includes(opts.format)) {
        throw new Error("--format must be markdown, json, csv, or console");
      }
    } else if (arg === "--output") {
      opts.output = argv[++i];
      if (!opts.output) throw new Error("--output requires a value");
    } else if (arg === "--no-color") {
      opts.color = false;
    } else if (arg === "--rpc-url") {
      opts.rpcUrl = argv[++i];
      if (!opts.rpcUrl) throw new Error("--rpc-url requires a value");
    } else if (arg === "--explorer-api-key") {
      opts.explorerApiKey = argv[++i];
      if (!opts.explorerApiKey) throw new Error("--explorer-api-key requires a value");
    } else if (arg === "--max-txs") {
      opts.maxTxs = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(opts.maxTxs) || opts.maxTxs < 0 || opts.maxTxs > 100) {
        throw new Error("--max-txs must be an integer from 0 to 100");
      }
    } else if (arg === "--include-zero-tokens") {
      opts.includeZeroTokens = true;
    } else if (arg === "--no-explorer") {
      opts.explorer = false;
    } else if (arg === "--timeout-ms") {
      opts.timeoutMs = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(opts.timeoutMs) || opts.timeoutMs < 1000) {
        throw new Error("--timeout-ms must be at least 1000");
      }
    } else if (arg === "--token-delay-ms") {
      opts.tokenDelayMs = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(opts.tokenDelayMs) || opts.tokenDelayMs < 0) {
        throw new Error("--token-delay-ms must be a non-negative integer");
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (opts.compareNetworks && opts.rpcUrl) {
    throw new Error("--rpc-url cannot be combined with --compare-networks");
  }
  if (opts.output && !opts.formatProvided) {
    opts.format = inferFormatFromOutput(opts.output) || opts.format;
  }

  return opts;
}

function inferFormatFromOutput(outputPath) {
  const ext = path.extname(outputPath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".csv") return "csv";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  return null;
}

async function readJson(relativePath) {
  const raw = await readFile(path.join(skillRoot, relativePath), "utf8");
  return JSON.parse(raw);
}

function findNetwork(networksConfig, requestedName) {
  const name = requestedName || networksConfig.defaultNetwork;
  const network = networksConfig.networks.find((item) => item.name === name);
  if (!network) {
    const names = networksConfig.networks.map((item) => item.name).join(", ");
    throw new Error(`Unsupported network "${name}". Supported: ${names}`);
  }
  return { ...network };
}

function hexToBigInt(hex) {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

function bigIntToJson(value) {
  return value.toString();
}

function formatUnits(value, decimals, precision = 6) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return whole.toString();
  let fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fractionText.length > precision) fractionText = fractionText.slice(0, precision);
  return `${whole.toString()}.${fractionText || "0"}`;
}

function shortAddress(address) {
  if (!address || !ADDRESS_RE.test(address)) return "n/a";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  if (!hash || typeof hash !== "string") return "n/a";
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function uniqueAddresses(addresses) {
  const seen = new Set();
  const unique = [];
  for (const address of addresses) {
    const trimmed = address.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}

function parseAddressesText(text) {
  return uniqueAddresses(text.match(/0x[a-fA-F0-9]{40}/g) || []);
}

function classifyTransaction(tx) {
  if (tx.isError === "1" || tx.isError === true) return "failed";
  if (!tx.to) return "contract creation";
  const value = tx.value ? BigInt(tx.value) : 0n;
  if (value > 0n && (!tx.input || tx.input === "0x")) return "native transfer";
  return "contract call";
}

function formatTxValue(value, nativeToken) {
  try {
    return `${formatUnits(BigInt(value || "0"), 18)} ${nativeToken}`;
  } catch {
    return "n/a";
  }
}

function explorerHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

let rpcId = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRpcError(error) {
  return /HTTP 429|cu limit|request too fast|fetch failed|network|timeout|aborted/i.test(error.message);
}

async function rpc(rpcUrl, method, params, timeoutMs) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${method} HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      const payload = JSON.parse(text);
      if (payload.error) {
        throw new Error(`${method}: ${payload.error.message || JSON.stringify(payload.error)}`);
      }
      return payload.result;
    } catch (error) {
      lastError = error;
      if (attempt === 4 || !isRetryableRpcError(error)) {
        throw new Error(`${method} failed on ${explorerHost(rpcUrl)}: ${error.message}`);
      }
      await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function encodeBalanceOf(address) {
  return `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

async function tokenBalance(rpcUrl, token, owner, timeoutMs) {
  const result = await rpc(
    rpcUrl,
    "eth_call",
    [{ to: token.address, data: encodeBalanceOf(owner) }, "latest"],
    timeoutMs
  );
  const raw = hexToBigInt(result);
  return {
    symbol: token.symbol,
    name: token.name,
    address: token.address,
    decimals: token.decimals,
    raw: raw.toString(),
    formatted: formatUnits(raw, token.decimals)
  };
}

async function fetchExplorerTransactions(network, address, maxTxs, timeoutMs, apiKey, latestBlock) {
  if (!network.explorerApiUrl || maxTxs === 0) return { status: "skipped", transactions: [] };
  if (!apiKey) {
    return {
      status: "skipped",
      message: "Set SOCIALSCAN_API_KEY or --explorer-api-key to enable explorer history.",
      transactions: []
    };
  }
  const url = new URL(network.explorerApiUrl.replace(/\/$/, "") + "/v1/developer/api");
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  const endBlock = latestBlock || 99999999n;
  const startBlock = endBlock > 99999n ? endBlock - 99999n : 0n;
  url.searchParams.set("startblock", startBlock.toString());
  url.searchParams.set("endblock", endBlock.toString());
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", String(maxTxs));
  url.searchParams.set("sort", "desc");
  url.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    const payload = JSON.parse(text);
    if (!Array.isArray(payload.result)) {
      return {
        status: "unavailable",
        message: payload.message || "Explorer did not return a transaction array",
        transactions: []
      };
    }
    return {
      status: "ok",
      transactions: payload.result.slice(0, maxTxs).map((tx) => {
        const normalized = {
          hash: firstPresent(tx.hash, tx.transactionHash, tx.transaction_hash),
          blockNumber: firstPresent(tx.blockNumber, tx.block_number),
          timeStamp: firstPresent(tx.timeStamp, tx.timestamp),
          from: firstPresent(tx.from, tx.fromAddress, tx.from_address, tx.from_address_hash),
          to: firstPresent(tx.to, tx.toAddress, tx.to_address, tx.to_address_hash),
          value: firstPresent(tx.value, tx.amount, "0"),
          gasUsed: firstPresent(tx.gasUsed, tx.gas_used),
          input: firstPresent(tx.input, tx.data),
          isError: firstPresent(tx.isError, tx.is_error, false)
        };
        return { ...normalized, type: classifyTransaction(normalized) };
      })
    };
  } catch (error) {
    return { status: "unavailable", message: error.message, transactions: [] };
  } finally {
    clearTimeout(timer);
  }
}

function scoreAudit(audit) {
  let score = 0;
  if (audit.nativeBalanceRaw !== "0") score += 25;

  const nonce = BigInt(audit.transactionCount);
  if (nonce >= 10n) score += 35;
  else if (nonce >= 3n) score += 25;
  else if (nonce >= 1n) score += 15;

  if (audit.tokens.some((token) => token.raw !== "0")) score += 20;
  if (audit.canPaySimpleTransferGas) score += 15;
  if (audit.accountType === "contract") score += 5;

  if (score > 100) score = 100;
  let label = "New or empty";
  if (score >= 80) label = "Active";
  else if (score >= 50) label = "Warm";
  else if (score >= 20) label = "Starter";
  return { value: score, label };
}

function recommendations(audit) {
  const tips = [];
  if (audit.nativeBalanceRaw === "0") tips.push(`Fund the wallet with ${audit.network.nativeToken} for gas.`);
  if (audit.transactionCount === "0") tips.push("No outgoing transactions detected by RPC nonce.");
  if (!audit.canPaySimpleTransferGas) tips.push("Native balance is below the current simple-transfer gas estimate.");
  if (!audit.tokens.some((token) => token.raw !== "0")) tips.push("No non-zero balances found in the known-token catalog.");
  if (audit.accountType === "contract") tips.push("Account has contract code; interpret nonce and activity differently from EOAs.");
  if (audit.explorer.status === "unavailable") tips.push("Explorer transaction history was unavailable; use RPC metrics as the source of truth.");
  if (tips.length === 0) tips.push("Wallet has native balance, known-token activity, and enough gas for a simple transfer.");
  return tips;
}

async function auditAddress(network, rpcUrl, tokenCatalog, address, opts) {
  const chainIdHex = await rpc(rpcUrl, "eth_chainId", [], opts.timeoutMs);
  await sleep(100);
  const blockHex = await rpc(rpcUrl, "eth_blockNumber", [], opts.timeoutMs);
  await sleep(100);
  const gasPriceHex = await rpc(rpcUrl, "eth_gasPrice", [], opts.timeoutMs);
  await sleep(100);
  const balanceHex = await rpc(rpcUrl, "eth_getBalance", [address, "latest"], opts.timeoutMs);
  await sleep(100);
  const nonceHex = await rpc(rpcUrl, "eth_getTransactionCount", [address, "latest"], opts.timeoutMs);
  await sleep(100);
  const code = await rpc(rpcUrl, "eth_getCode", [address, "latest"], opts.timeoutMs);

  const chainId = Number(hexToBigInt(chainIdHex));
  const latestBlock = hexToBigInt(blockHex);
  const nativeBalance = hexToBigInt(balanceHex);
  const gasPrice = hexToBigInt(gasPriceHex);
  const simpleTransferGasWei = gasPrice * 21000n;
  const configuredTokens = tokenCatalog[network.name] || [];
  const tokens = [];
  for (const token of configuredTokens) {
    try {
      tokens.push(await tokenBalance(rpcUrl, token, address, opts.timeoutMs));
    } catch (error) {
      tokens.push({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        raw: "0",
        formatted: "0",
        error: error.message
      });
    }
    if (opts.tokenDelayMs > 0) await sleep(opts.tokenDelayMs);
  }
  const visibleTokens = opts.includeZeroTokens ? tokens : tokens.filter((token) => token.raw !== "0" || token.error);
  const explorer = opts.explorer
    ? await fetchExplorerTransactions(network, address, opts.maxTxs, opts.timeoutMs, opts.explorerApiKey, latestBlock)
    : { status: "skipped", transactions: [] };

  const audit = {
    address,
    accountType: code && code !== "0x" ? "contract" : "eoa",
    network: {
      name: network.name,
      chainId: network.chainId,
      nativeToken: network.nativeToken,
      explorerUrl: network.explorerUrl,
      rpcHost: explorerHost(rpcUrl)
    },
    observedChainId: chainId,
    latestBlock: bigIntToJson(latestBlock),
    nativeBalanceRaw: nativeBalance.toString(),
    nativeBalance: formatUnits(nativeBalance, 18),
    transactionCount: bigIntToJson(hexToBigInt(nonceHex)),
    gasPriceWei: gasPrice.toString(),
    simpleTransferGasWei: simpleTransferGasWei.toString(),
    simpleTransferGasNative: formatUnits(simpleTransferGasWei, 18),
    canPaySimpleTransferGas: nativeBalance >= simpleTransferGasWei,
    tokens: visibleTokens,
    explorer
  };
  audit.score = scoreAudit(audit);
  audit.recommendations = recommendations(audit);
  if (chainId !== network.chainId) {
    audit.recommendations.unshift(`RPC chain ID ${chainId} does not match configured ${network.chainId}.`);
  }
  return audit;
}

function renderMarkdown(result) {
  if (result.mode === "compare-networks") return renderNetworkComparisonMarkdown(result);

  const network = result.network;
  const latestBlock = result.wallets[0]?.latestBlock || "unknown";
  const lines = [
    `# Pharos Wallet Activity Audit`,
    ``,
    `Network: ${network.name} (chain ID ${network.chainId}, native ${network.nativeToken})`,
    `RPC host: ${network.rpcHost}`,
    `Explorer: ${network.explorerUrl}`,
    `Latest block: ${latestBlock}`,
    ``
  ];

  for (const wallet of result.wallets) {
    lines.push(`## ${shortAddress(wallet.address)}`);
    lines.push(``);
    lines.push(`| Metric | Value |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Address | \`${wallet.address}\` |`);
    lines.push(`| Account type | ${wallet.accountType.toUpperCase()} |`);
    lines.push(`| Activity score | ${wallet.score.value}/100 (${wallet.score.label}) |`);
    lines.push(`| Native balance | ${wallet.nativeBalance} ${wallet.network.nativeToken} |`);
    lines.push(`| Transaction count | ${wallet.transactionCount} |`);
    lines.push(`| Gas price | ${wallet.gasPriceWei} wei |`);
    lines.push(`| Simple transfer gas estimate | ${wallet.simpleTransferGasNative} ${wallet.network.nativeToken} |`);
    lines.push(`| Can pay simple transfer gas | ${wallet.canPaySimpleTransferGas ? "yes" : "no"} |`);
    lines.push(``);

    lines.push(`### Known Tokens`);
    if (wallet.tokens.length === 0) {
      lines.push(`No non-zero known-token balances found.`);
    } else {
      lines.push(`| Token | Balance | Contract |`);
      lines.push(`| --- | ---: | --- |`);
      for (const token of wallet.tokens) {
        const suffix = token.error ? ` (${token.error})` : "";
        lines.push(`| ${token.symbol} | ${token.formatted}${suffix} | \`${token.address}\` |`);
      }
    }
    lines.push(``);

    lines.push(`### Recent Transactions`);
    if (wallet.explorer.status === "ok" && wallet.explorer.transactions.length > 0) {
      lines.push(`| Hash | Block | Type | From | To | Value | Error |`);
      lines.push(`| --- | ---: | --- | --- | --- | ---: | --- |`);
      for (const tx of wallet.explorer.transactions) {
        lines.push(
          `| \`${shortHash(tx.hash)}\` | ${tx.blockNumber || "n/a"} | ${tx.type || "n/a"} | ${shortAddress(tx.from)} | ${shortAddress(tx.to)} | ${formatTxValue(tx.value, wallet.network.nativeToken)} | ${tx.isError === "1" || tx.isError === true ? "yes" : "no"} |`
        );
      }
    } else {
      const note = wallet.explorer.message ? ` (${wallet.explorer.message})` : "";
      lines.push(`Explorer history ${wallet.explorer.status}${note}.`);
    }
    lines.push(``);

    lines.push(`### Recommendations`);
    for (const tip of wallet.recommendations) lines.push(`- ${tip}`);
    lines.push(``);
  }

  if (result.wallets.length > 1) {
    lines.push(`## Ranking`);
    lines.push(``);
    lines.push(`| Rank | Wallet | Score | Label |`);
    lines.push(`| ---: | --- | ---: | --- |`);
    result.wallets
      .slice()
      .sort((a, b) => b.score.value - a.score.value)
      .forEach((wallet, index) => {
        lines.push(`| ${index + 1} | \`${wallet.address}\` | ${wallet.score.value} | ${wallet.score.label} |`);
      });
    lines.push(``);
  }

  lines.push(`_Read-only audit. No private keys were requested or used._`);
  return lines.join("\n");
}

function tokenSummary(wallet) {
  if (wallet.error) return "n/a";
  const nonZero = wallet.tokens.filter((token) => token.raw !== "0");
  if (nonZero.length === 0) return "none";
  return nonZero.map((token) => `${token.symbol}: ${token.formatted}`).join(", ");
}

function compareRecommendations(audits) {
  const tips = [];
  const failed = audits.filter((audit) => audit.error);
  const successful = audits.filter((audit) => !audit.error);
  if (failed.length > 0) {
    tips.push(`Could not audit: ${failed.map((audit) => `${audit.network.name} (${audit.error})`).join(", ")}.`);
  }
  if (successful.length === 0) return tips;

  const sorted = successful.slice().sort((a, b) => b.score.value - a.score.value);
  const best = sorted[0];
  if (best) tips.push(`Highest readiness is on ${best.network.name}: ${best.score.value}/100 (${best.score.label}).`);

  const missingGas = successful.filter((audit) => !audit.canPaySimpleTransferGas);
  if (missingGas.length > 0) {
    tips.push(`Fund gas on: ${missingGas.map((audit) => `${audit.network.name} (${audit.network.nativeToken})`).join(", ")}.`);
  } else {
    tips.push("Wallet is gas-ready on every successfully checked Pharos network.");
  }

  const noTokens = successful.filter((audit) => !audit.tokens.some((token) => token.raw !== "0"));
  if (noTokens.length > 0) {
    tips.push(`No known-token balances on: ${noTokens.map((audit) => audit.network.name).join(", ")}.`);
  }

  return tips;
}

function renderNetworkComparisonMarkdown(result) {
  const lines = [
    `# Pharos Cross-Network Wallet Audit`,
    ``,
    `Networks: ${result.networks.map((network) => `${network.name} (${network.nativeToken})`).join(", ")}`,
    ``
  ];

  for (const comparison of result.comparisons) {
    lines.push(`## ${shortAddress(comparison.address)}`);
    lines.push(``);
    lines.push(`| Network | Score | Native balance | Tx count | Gas ready | Known tokens | Latest block |`);
    lines.push(`| --- | ---: | ---: | ---: | --- | --- | ---: |`);
    for (const wallet of comparison.wallets) {
      if (wallet.error) {
        lines.push(
          `| ${wallet.network.name} | ERROR | n/a | n/a | n/a | n/a | n/a |`
        );
        continue;
      }
      lines.push(
        `| ${wallet.network.name} | ${wallet.score.value}/100 ${wallet.score.label} | ${wallet.nativeBalance} ${wallet.network.nativeToken} | ${wallet.transactionCount} | ${wallet.canPaySimpleTransferGas ? "yes" : "no"} | ${tokenSummary(wallet)} | ${wallet.latestBlock} |`
      );
    }
    lines.push(``);
    lines.push(`### Cross-Network Recommendations`);
    for (const tip of comparison.recommendations) lines.push(`- ${tip}`);
    lines.push(``);

    for (const wallet of comparison.wallets) {
      lines.push(`### ${wallet.network.name} Details`);
      if (wallet.error) {
        lines.push(`- Error: ${wallet.error}`);
        lines.push(`- RPC host: ${wallet.network.rpcHost}`);
        lines.push(``);
        continue;
      }
      lines.push(`- Account type: ${wallet.accountType.toUpperCase()}`);
      lines.push(`- Explorer: ${wallet.network.explorerUrl}`);
      lines.push(`- Simple transfer gas estimate: ${wallet.simpleTransferGasNative} ${wallet.network.nativeToken}`);
      if (wallet.recommendations.length > 0) {
        for (const tip of wallet.recommendations) lines.push(`- ${tip}`);
      }
      lines.push(``);
    }
  }

  lines.push(`_Read-only audit. No private keys were requested or used._`);
  return lines.join("\n");
}

function stringifyJson(value) {
  return JSON.stringify(value, null, 2);
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m"
};

function color(text, code, enabled) {
  return enabled ? `${code}${text}${ANSI.reset}` : text;
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleLength(text) {
  return stripAnsi(text).length;
}

function padCell(value, width, align = "left") {
  const text = String(value);
  const padding = Math.max(0, width - visibleLength(text));
  if (align === "right") return `${" ".repeat(padding)}${text}`;
  return `${text}${" ".repeat(padding)}`;
}

function renderAsciiTable(headers, rows, align = []) {
  const widths = headers.map((header, index) => {
    const rowWidths = rows.map((row) => visibleLength(row[index] ?? ""));
    return Math.max(visibleLength(header), ...rowWidths);
  });
  const separator = `+-${widths.map((width) => "-".repeat(width)).join("-+-")}-+`;
  const renderRow = (row) => `| ${row.map((value, index) => padCell(value ?? "", widths[index], align[index])).join(" | ")} |`;
  return [
    separator,
    renderRow(headers),
    separator,
    ...rows.map(renderRow),
    separator
  ].join("\n");
}

function scoreText(score, enabled) {
  const value = `${score.value}/100 ${score.label}`;
  if (score.value >= 80) return color(value, ANSI.green, enabled);
  if (score.value >= 50) return color(value, ANSI.yellow, enabled);
  return color(value, ANSI.red, enabled);
}

function yesNo(value, enabled) {
  return value ? color("yes", ANSI.green, enabled) : color("no", ANSI.red, enabled);
}

function consoleHeader(title, enabled) {
  const line = "=".repeat(Math.max(60, title.length));
  return [
    color(line, ANSI.cyan, enabled),
    color(title, ANSI.bold, enabled),
    color(line, ANSI.cyan, enabled)
  ].join("\n");
}

function renderRecommendations(tips, enabled) {
  return tips.map((tip) => `${color("-", ANSI.cyan, enabled)} ${tip}`).join("\n");
}

function renderSingleNetworkConsole(result, enabled) {
  const network = result.network;
  const latestBlock = result.wallets[0]?.latestBlock || "unknown";
  const lines = [
    consoleHeader("PHAROS WALLET ACTIVITY AUDIT", enabled),
    `Generated: ${result.generatedAt}`,
    `Network:   ${color(network.name, ANSI.cyan, enabled)} (${network.chainId}, ${network.nativeToken})`,
    `RPC host:  ${network.rpcHost}`,
    `Explorer:  ${network.explorerUrl}`,
    `Block:     ${latestBlock}`,
    ""
  ];

  for (const wallet of result.wallets) {
    lines.push(color(`Wallet ${shortAddress(wallet.address)}`, ANSI.bold, enabled));
    lines.push(renderAsciiTable(
      ["Metric", "Value"],
      [
        ["Address", wallet.address],
        ["Account type", wallet.accountType.toUpperCase()],
        ["Activity score", scoreText(wallet.score, enabled)],
        ["Native balance", `${wallet.nativeBalance} ${wallet.network.nativeToken}`],
        ["Transaction count", wallet.transactionCount],
        ["Gas price", `${wallet.gasPriceWei} wei`],
        ["Simple transfer gas", `${wallet.simpleTransferGasNative} ${wallet.network.nativeToken}`],
        ["Can pay gas", yesNo(wallet.canPaySimpleTransferGas, enabled)]
      ]
    ));
    lines.push("");

    lines.push(color("Known Tokens", ANSI.bold, enabled));
    if (wallet.tokens.length === 0) {
      lines.push("No non-zero known-token balances found.");
    } else {
      lines.push(renderAsciiTable(
        ["Token", "Balance", "Contract"],
        wallet.tokens.map((token) => [
          token.symbol,
          token.error ? `${token.formatted} (${token.error})` : token.formatted,
          token.address
        ]),
        ["left", "right", "left"]
      ));
    }
    lines.push("");

    lines.push(color("Recent Transactions", ANSI.bold, enabled));
    if (wallet.explorer.status === "ok" && wallet.explorer.transactions.length > 0) {
      lines.push(renderAsciiTable(
        ["Hash", "Block", "Type", "From", "To", "Value", "Error"],
        wallet.explorer.transactions.map((tx) => [
          shortHash(tx.hash),
          tx.blockNumber || "n/a",
          tx.type || "n/a",
          shortAddress(tx.from),
          shortAddress(tx.to),
          formatTxValue(tx.value, wallet.network.nativeToken),
          tx.isError === "1" || tx.isError === true ? "yes" : "no"
        ]),
        ["left", "right", "left", "left", "left", "right", "left"]
      ));
    } else {
      const note = wallet.explorer.message ? ` (${wallet.explorer.message})` : "";
      lines.push(`Explorer history ${wallet.explorer.status}${note}.`);
    }
    lines.push("");

    lines.push(color("Recommendations", ANSI.bold, enabled));
    lines.push(renderRecommendations(wallet.recommendations, enabled));
    lines.push("");
  }

  lines.push(color("Read-only audit. No private keys were requested or used.", ANSI.dim, enabled));
  return lines.join("\n");
}

function renderNetworkComparisonConsole(result, enabled) {
  const lines = [
    consoleHeader("PHAROS CROSS-NETWORK WALLET AUDIT", enabled),
    `Generated: ${result.generatedAt}`,
    `Networks:  ${result.networks.map((network) => `${network.name} (${network.nativeToken})`).join(", ")}`,
    ""
  ];

  for (const comparison of result.comparisons) {
    lines.push(color(`Wallet ${shortAddress(comparison.address)}`, ANSI.bold, enabled));
    lines.push(renderAsciiTable(
      ["Network", "Score", "Native balance", "Tx count", "Gas ready", "Known tokens", "Block"],
      comparison.wallets.map((wallet) => {
        if (wallet.error) return [wallet.network.name, color("ERROR", ANSI.red, enabled), "n/a", "n/a", "n/a", "n/a", "n/a"];
        return [
          wallet.network.name,
          scoreText(wallet.score, enabled),
          `${wallet.nativeBalance} ${wallet.network.nativeToken}`,
          wallet.transactionCount,
          yesNo(wallet.canPaySimpleTransferGas, enabled),
          tokenSummary(wallet),
          wallet.latestBlock
        ];
      }),
      ["left", "right", "right", "right", "left", "left", "right"]
    ));
    lines.push("");

    lines.push(color("Cross-Network Recommendations", ANSI.bold, enabled));
    lines.push(renderRecommendations(comparison.recommendations, enabled));
    lines.push("");

    for (const wallet of comparison.wallets) {
      lines.push(color(`${wallet.network.name} Details`, ANSI.bold, enabled));
      if (wallet.error) {
        lines.push(`- Error: ${wallet.error}`);
        lines.push(`- RPC host: ${wallet.network.rpcHost}`);
      } else {
        lines.push(`- Account type: ${wallet.accountType.toUpperCase()}`);
        lines.push(`- Explorer: ${wallet.network.explorerUrl}`);
        lines.push(`- Simple transfer gas estimate: ${wallet.simpleTransferGasNative} ${wallet.network.nativeToken}`);
        for (const tip of wallet.recommendations) lines.push(`- ${tip}`);
      }
      lines.push("");
    }
  }

  lines.push(color("Read-only audit. No private keys were requested or used.", ANSI.dim, enabled));
  return lines.join("\n");
}

function renderConsole(result, enabled) {
  if (result.mode === "compare-networks") return renderNetworkComparisonConsole(result, enabled);
  return renderSingleNetworkConsole(result, enabled);
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvLine(values) {
  return values.map(csvCell).join(",");
}

function csvWalletRow(base, wallet, comparisonRecommendations = []) {
  const recommendations = wallet.error
    ? (wallet.recommendations || []).join(" | ")
    : (wallet.recommendations || []).join(" | ");
  return {
    generatedAt: base.generatedAt,
    mode: base.mode,
    address: wallet.address,
    network: wallet.network.name,
    chainId: wallet.network.chainId,
    accountType: wallet.accountType || "n/a",
    score: wallet.score?.value ?? "",
    scoreLabel: wallet.score?.label || "",
    nativeToken: wallet.network.nativeToken,
    nativeBalance: wallet.nativeBalance || "",
    transactionCount: wallet.transactionCount || "",
    gasReady: wallet.error ? "" : wallet.canPaySimpleTransferGas ? "yes" : "no",
    knownTokens: wallet.error ? "" : tokenSummary(wallet),
    latestBlock: wallet.latestBlock || "",
    explorerStatus: wallet.explorer?.status || "",
    error: wallet.error || "",
    recommendations,
    comparisonRecommendations: comparisonRecommendations.join(" | ")
  };
}

function renderCsv(result) {
  const headers = [
    "generatedAt",
    "mode",
    "address",
    "network",
    "chainId",
    "accountType",
    "score",
    "scoreLabel",
    "nativeToken",
    "nativeBalance",
    "transactionCount",
    "gasReady",
    "knownTokens",
    "latestBlock",
    "explorerStatus",
    "error",
    "recommendations",
    "comparisonRecommendations"
  ];
  const rows = [];
  if (result.mode === "compare-networks") {
    for (const comparison of result.comparisons) {
      for (const wallet of comparison.wallets) {
        rows.push(csvWalletRow(result, wallet, comparison.recommendations));
      }
    }
  } else {
    for (const wallet of result.wallets) rows.push(csvWalletRow(result, wallet));
  }
  return [
    csvLine(headers),
    ...rows.map((row) => csvLine(headers.map((header) => row[header])))
  ].join("\n");
}

function renderOutput(result, opts) {
  if (opts.format === "json") return stringifyJson(result);
  if (opts.format === "csv") return renderCsv(result);
  if (opts.format === "console") return renderConsole(result, opts.color && !opts.output);
  return renderMarkdown(result);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return;
  }

  if (opts.addressesFile) {
    const rawAddresses = await readFile(opts.addressesFile, "utf8");
    opts.addresses.push(...parseAddressesText(rawAddresses));
  }
  opts.addresses = uniqueAddresses(opts.addresses);

  if (opts.addresses.length === 0) throw new Error("At least one --address is required");
  for (const address of opts.addresses) {
    if (!ADDRESS_RE.test(address)) throw new Error(`Invalid address: ${address}`);
  }

  const [networksConfig, tokenCatalog] = await Promise.all([
    readJson("assets/networks.json"),
    readJson("assets/tokens.json")
  ]);
  let result;

  if (opts.compareNetworks) {
    const networks = networksConfig.networks.map((network) => ({ ...network }));
    const comparisons = [];
    for (const address of opts.addresses) {
      const wallets = [];
      for (const network of networks) {
        try {
          wallets.push(await auditAddress(network, network.rpcUrl, tokenCatalog, address, opts));
        } catch (error) {
          wallets.push({
            address,
            error: error.message,
            network: {
              name: network.name,
              chainId: network.chainId,
              nativeToken: network.nativeToken,
              explorerUrl: network.explorerUrl,
              rpcHost: explorerHost(network.rpcUrl)
            },
            score: { value: 0, label: "Unavailable" },
            tokens: [],
            recommendations: [`Retry ${network.name} later or run with --network ${network.name}.`]
          });
        }
      }
      comparisons.push({
        address,
        wallets,
        recommendations: compareRecommendations(wallets)
      });
    }
    result = {
      generatedAt: new Date().toISOString(),
      mode: "compare-networks",
      networks: networks.map((network) => ({
        name: network.name,
        chainId: network.chainId,
        nativeToken: network.nativeToken,
        explorerUrl: network.explorerUrl,
        rpcHost: explorerHost(network.rpcUrl)
      })),
      comparisons
    };
  } else {
    const network = findNetwork(networksConfig, opts.network);
    const rpcUrl = opts.rpcUrl || network.rpcUrl;
    const wallets = [];

    for (const address of opts.addresses) {
      wallets.push(await auditAddress(network, rpcUrl, tokenCatalog, address, opts));
    }

    result = {
      generatedAt: new Date().toISOString(),
      mode: "single-network",
      network: {
        name: network.name,
        chainId: network.chainId,
        nativeToken: network.nativeToken,
        explorerUrl: network.explorerUrl,
        rpcHost: explorerHost(rpcUrl)
      },
      wallets
    };
  }

  const output = renderOutput(result, opts);
  if (opts.output) await writeFile(opts.output, `${output}\n`, "utf8");
  else console.log(output);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
