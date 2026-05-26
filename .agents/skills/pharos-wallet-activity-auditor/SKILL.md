---
name: pharos-wallet-activity-auditor
description: Audit Pharos wallet activity and readiness with read-only checks. Use when a user asks for a Pharos wallet activity report, testnet or mainnet progress check, wallet health summary, known-token balance scan, nonce/activity review, gas-readiness check, multi-wallet comparison, or an eligibility-style audit for Pharos onchain usage. Never request private keys; this skill only performs public JSON-RPC and optional explorer reads.
---

# Pharos Wallet Activity Auditor

Create a read-only activity report for one or more Pharos addresses. The report combines native balance, transaction count, account type, gas readiness, known token balances, optional explorer transaction history, and a compact activity score.

## Workflow

1. Validate every address as `0x` plus 40 hex characters.
2. Default to `atlantic-testnet` unless the user explicitly asks for `mainnet`.
3. Run the bundled script from the skill root:

```bash
node scripts/audit-wallet.mjs --address 0x0000000000000000000000000000000000000000 --network atlantic-testnet --format markdown
```

For multiple wallets:

```bash
node scripts/audit-wallet.mjs --address 0x1111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222 --network atlantic-testnet
```

For machine-readable output:

```bash
node scripts/audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --format json
```

## Inputs

- `--address <address[,address...]>`: Required. Repeatable.
- `--network atlantic-testnet|mainnet`: Optional. Defaults to `atlantic-testnet`.
- `--format markdown|json`: Optional. Defaults to `markdown`.
- `--rpc-url <url>`: Optional override for custom RPC routing.
- `--max-txs <n>`: Optional explorer transaction history size. Defaults to `5`.
- `--explorer-api-key <key>`: Optional SocialScan API key for recent transaction history. The script also reads `SOCIALSCAN_API_KEY`.
- `--include-zero-tokens`: Include zero token balances in the report.
- `--no-explorer`: Skip explorer transaction history and use RPC-only checks.
- `--token-delay-ms <n>`: Optional delay between token calls. Defaults to `200` to avoid public RPC rate limits.

## Report Rules

- Treat this skill as read-only. Do not ask for or use private keys.
- Show the target network, chain ID, RPC URL host, and explorer URL before summarizing results.
- Label EOAs and contract accounts using `eth_getCode`.
- Use transaction count as a lightweight activity signal, not as proof of eligibility.
- Mark gas readiness by comparing native balance to `gasPrice * 21000`.
- Include known token balances from `assets/tokens.json`; hide zero balances unless the user asks for a complete token table.
- Query token balances sequentially; public Pharos RPC endpoints can rate-limit parallel `eth_call` bursts.
- If `SOCIALSCAN_API_KEY` or `--explorer-api-key` is not set, skip explorer history and still return the RPC-based audit.

## Score Interpretation

Read `references/scoring.md` when the user asks how the score is calculated or wants threshold changes. The default score is a heuristic for wallet readiness and activity, not a Sybil verdict or campaign eligibility guarantee.

## Examples

Read `references/examples.md` when the user wants demo prompts, a Discord submission demo flow, or screenshots/video script ideas.

## Safety

For transfers, deployments, contract writes, or any operation requiring a private key, stop using this skill and invoke the general Pharos onchain skill instead. This auditor must not sign transactions.
