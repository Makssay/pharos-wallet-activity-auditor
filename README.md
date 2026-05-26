# Pharos Wallet Activity Auditor

Read-only Agent Center skill for auditing Pharos wallet activity and readiness.

The skill checks:

- native PHRS/PROS balance
- transaction count / nonce
- EOA vs contract account type
- current gas readiness for a simple transfer
- known token balances from bundled Pharos token metadata
- optional SocialScan transaction history when `SOCIALSCAN_API_KEY` is configured
- activity score and actionable recommendations

## Skill Path

```text
.agents/skills/pharos-wallet-activity-auditor
```

## Usage With Codex / Agent Center

Ask:

```text
Use $pharos-wallet-activity-auditor to audit 0x1111111111111111111111111111111111111111 on Pharos Atlantic testnet.
```

## Direct CLI Demo

From this repository:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --address 0x1111111111111111111111111111111111111111 \
  --network atlantic-testnet
```

JSON output:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --address 0x1111111111111111111111111111111111111111 \
  --network atlantic-testnet \
  --format json
```

## Optional Explorer History

RPC-based checks work without API keys. Recent transaction history uses SocialScan Explorer API:

```bash
export SOCIALSCAN_API_KEY=your_key_here
```

or:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --address 0x1111111111111111111111111111111111111111 \
  --explorer-api-key your_key_here
```

## Supported Networks

- Pharos Atlantic testnet
- Pharos mainnet

Network and token metadata live in:

```text
.agents/skills/pharos-wallet-activity-auditor/assets/
```

## Safety

This skill is read-only. It never requests private keys, never signs transactions, and never sends write calls.
