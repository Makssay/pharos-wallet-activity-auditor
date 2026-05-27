# Pharos Wallet Activity Auditor

Read-only Agent Center skill for auditing Pharos wallet activity and readiness across Pharos Atlantic testnet and mainnet.

The skill checks:

- native PHRS/PROS balance
- transaction count / nonce
- EOA vs contract account type
- current gas readiness for a simple transfer
- known token balances from bundled Pharos token metadata
- optional SocialScan transaction history when `SOCIALSCAN_API_KEY` is configured
- recent transaction classification when explorer data is available
- activity score and actionable recommendations
- cross-network readiness comparison with `--compare-networks`
- CSV batch input with `--addresses-file`
- CSV export with `--format csv`
- polished terminal output with `--format console`

## Skill Path

```text
.agents/skills/pharos-wallet-activity-auditor
```

## Requirements

- Node.js 18+ (`fetch` is built in)
- No npm packages required
- Optional: `SOCIALSCAN_API_KEY` for explorer transaction history

## Installation

### Install into the current Agent Center style repo

```powershell
npx skills add https://github.com/Makssay/pharos-wallet-activity-auditor
```

This creates:

```text
.agents/skills/pharos-wallet-activity-auditor
```

### Clone the full repository

```powershell
git clone https://github.com/Makssay/pharos-wallet-activity-auditor.git
cd pharos-wallet-activity-auditor
```

### Manual copy into an existing repo

Copy this folder into your project:

```text
.agents/skills/pharos-wallet-activity-auditor
```

### Global Codex install

Copy the skill folder into:

```text
%USERPROFILE%\.codex\skills\pharos-wallet-activity-auditor
```

Then restart Codex so it can pick up the new skill.

## Usage With Codex / Agent Center

Ask:

```text
Use $pharos-wallet-activity-auditor to audit 0x1111111111111111111111111111111111111111 on Pharos Atlantic testnet.
```

Cross-network prompt:

```text
Use $pharos-wallet-activity-auditor to compare 0x1111111111111111111111111111111111111111 across Pharos testnet and mainnet.
```

## Quick Start For Demo

PowerShell one-line command:

```powershell
node .\.agents\skills\pharos-wallet-activity-auditor\scripts\audit-wallet.mjs --address 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --compare-networks --format console --no-explorer
```

Bash/macOS/Linux:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs --address 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --compare-networks --format console --no-explorer
```

## Demo Media

Demo video: attach your recording in the Pharos Discord submission or link it here after publishing.

Screenshot: attach a console or report screenshot in the Pharos Discord submission or link it here after publishing.

## Direct CLI Usage

From this repository:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --address 0x1111111111111111111111111111111111111111 \
  --network atlantic-testnet
```

PowerShell equivalent:

```powershell
node .\.agents\skills\pharos-wallet-activity-auditor\scripts\audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --network atlantic-testnet
```

JSON output:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --address 0x1111111111111111111111111111111111111111 \
  --network atlantic-testnet \
  --format json \
  --no-explorer
```

PowerShell equivalent:

```powershell
node .\.agents\skills\pharos-wallet-activity-auditor\scripts\audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --network atlantic-testnet --format json --no-explorer
```

Cross-network comparison:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --address 0x1111111111111111111111111111111111111111 \
  --compare-networks \
  --no-explorer
```

PowerShell equivalent:

```powershell
node .\.agents\skills\pharos-wallet-activity-auditor\scripts\audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --compare-networks --no-explorer
```

Polished console output for demos:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --address 0x1111111111111111111111111111111111111111 \
  --compare-networks \
  --format console \
  --no-explorer
```

PowerShell equivalent:

```powershell
node .\.agents\skills\pharos-wallet-activity-auditor\scripts\audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --compare-networks --format console --no-explorer
```

Batch CSV input:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --addresses-file wallets.csv \
  --network atlantic-testnet
```

PowerShell equivalent:

```powershell
node .\.agents\skills\pharos-wallet-activity-auditor\scripts\audit-wallet.mjs --addresses-file wallets.csv --network atlantic-testnet
```

CSV export:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --addresses-file wallets.csv \
  --compare-networks \
  --format csv \
  --output pharos-wallet-audit.csv \
  --no-explorer
```

PowerShell equivalent:

```powershell
node .\.agents\skills\pharos-wallet-activity-auditor\scripts\audit-wallet.mjs --addresses-file wallets.csv --compare-networks --format csv --output pharos-wallet-audit.csv --no-explorer
```

Save reports:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --address 0x1111111111111111111111111111111111111111 \
  --network mainnet \
  --output report.md
```

PowerShell equivalent:

```powershell
node .\.agents\skills\pharos-wallet-activity-auditor\scripts\audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --network mainnet --output report.md
```

The output format is inferred from `.json`, `.csv`, `.md`, or `.markdown` when `--format` is omitted:

```bash
node .agents/skills/pharos-wallet-activity-auditor/scripts/audit-wallet.mjs \
  --address 0x1111111111111111111111111111111111111111 \
  --network mainnet \
  --output report.json
```

PowerShell equivalent:

```powershell
node .\.agents\skills\pharos-wallet-activity-auditor\scripts\audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --network mainnet --output report.json
```

## Example Output

```text
Activity score: 95/100 (Active)
Native balance: 20.150407 PHRS
Transaction count: 294
Can pay simple transfer gas: yes
Known tokens: USDT, WETH
Recommendation: Wallet has native balance, known-token activity, and enough gas for a simple transfer.
```

Cross-network comparison example:

```text
Network            Score     Native balance     Tx count     Gas ready
atlantic-testnet   95/100    20.150407 PHRS     294          yes
mainnet            75/100    2.868757 PROS      110          yes
```

CSV export columns include:

```text
generatedAt,mode,address,network,chainId,accountType,score,scoreLabel,nativeToken,nativeBalance,transactionCount,gasReady,knownTokens,latestBlock,explorerStatus,error,recommendations,comparisonRecommendations
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

For public demos, use `--no-explorer` if you do not want to configure or expose an API key.

## Supported Networks

- Pharos Atlantic testnet
- Pharos mainnet

Network and token metadata live in:

```text
.agents/skills/pharos-wallet-activity-auditor/assets/
```

## Safety

This skill is read-only. It never requests private keys, never signs transactions, and never sends write calls.
