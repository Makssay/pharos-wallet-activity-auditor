#!/usr/bin/env node
import { readFile } from "node:fs/promises";
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
  --network <name>           atlantic-testnet or mainnet. Defaults to config default.
  --format <markdown|json>   Output format. Default: markdown.
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
    network: null,
    format: "markdown",
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
    } else if (arg === "--network") {
      opts.network = argv[++i];
      if (!opts.network) throw new Error("--network requires a value");
    } else if (arg === "--format") {
      opts.format = argv[++i];
      if (!["markdown", "json"].includes(opts.format)) {
        throw new Error("--format must be markdown or json");
      }
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

  return opts;
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
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
      if (attempt === 2 || !isRetryableRpcError(error)) throw error;
      await sleep(300 * (attempt + 1));
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

async function fetchExplorerTransactions(network, address, maxTxs, timeoutMs, apiKey) {
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
  url.searchParams.set("startblock", "0");
  url.searchParams.set("endblock", "99999999");
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
      transactions: payload.result.slice(0, maxTxs).map((tx) => ({
        hash: tx.hash,
        blockNumber: tx.blockNumber,
        timeStamp: tx.timeStamp,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        gasUsed: tx.gasUsed,
        isError: tx.isError
      }))
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
  const [chainIdHex, blockHex, gasPriceHex, balanceHex, nonceHex, code] = await Promise.all([
    rpc(rpcUrl, "eth_chainId", [], opts.timeoutMs),
    rpc(rpcUrl, "eth_blockNumber", [], opts.timeoutMs),
    rpc(rpcUrl, "eth_gasPrice", [], opts.timeoutMs),
    rpc(rpcUrl, "eth_getBalance", [address, "latest"], opts.timeoutMs),
    rpc(rpcUrl, "eth_getTransactionCount", [address, "latest"], opts.timeoutMs),
    rpc(rpcUrl, "eth_getCode", [address, "latest"], opts.timeoutMs)
  ]);

  const chainId = Number(hexToBigInt(chainIdHex));
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
    ? await fetchExplorerTransactions(network, address, opts.maxTxs, opts.timeoutMs, opts.explorerApiKey)
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
    latestBlock: bigIntToJson(hexToBigInt(blockHex)),
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
      lines.push(`| Hash | Block | From | To | Error |`);
      lines.push(`| --- | ---: | --- | --- | --- |`);
      for (const tx of wallet.explorer.transactions) {
        lines.push(
          `| \`${tx.hash}\` | ${tx.blockNumber} | ${shortAddress(tx.from || "")} | ${shortAddress(tx.to || "")} | ${tx.isError === "1" ? "yes" : "no"} |`
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

function stringifyJson(value) {
  return JSON.stringify(value, null, 2);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return;
  }
  if (opts.addresses.length === 0) throw new Error("At least one --address is required");
  for (const address of opts.addresses) {
    if (!ADDRESS_RE.test(address)) throw new Error(`Invalid address: ${address}`);
  }

  const [networksConfig, tokenCatalog] = await Promise.all([
    readJson("assets/networks.json"),
    readJson("assets/tokens.json")
  ]);
  const network = findNetwork(networksConfig, opts.network);
  const rpcUrl = opts.rpcUrl || network.rpcUrl;
  const wallets = [];

  for (const address of opts.addresses) {
    wallets.push(await auditAddress(network, rpcUrl, tokenCatalog, address, opts));
  }

  const result = {
    generatedAt: new Date().toISOString(),
    network: {
      name: network.name,
      chainId: network.chainId,
      nativeToken: network.nativeToken,
      explorerUrl: network.explorerUrl,
      rpcHost: explorerHost(rpcUrl)
    },
    wallets
  };

  if (opts.format === "json") console.log(stringifyJson(result));
  else console.log(renderMarkdown(result));
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
