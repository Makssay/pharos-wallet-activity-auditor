# Example Prompts

## Single Wallet

```text
Use $pharos-wallet-activity-auditor to audit 0x1111111111111111111111111111111111111111 on Pharos Atlantic testnet. Show a concise markdown report.
```

## Multi-Wallet Comparison

```text
Use $pharos-wallet-activity-auditor to compare these Pharos wallets and rank them by activity readiness: 0x1111111111111111111111111111111111111111, 0x2222222222222222222222222222222222222222.
```

## CSV Batch Audit

```text
Use $pharos-wallet-activity-auditor to audit all wallets from wallets.csv on Pharos Atlantic testnet and export a CSV report.
```

Direct command:

```bash
node scripts/audit-wallet.mjs --addresses-file wallets.csv --network atlantic-testnet --format csv --output pharos-wallet-audit.csv
```

## JSON Output

```text
Use $pharos-wallet-activity-auditor to generate JSON for 0x1111111111111111111111111111111111111111 on mainnet.
```

## Cross-Network Readiness

```text
Use $pharos-wallet-activity-auditor to compare 0x1111111111111111111111111111111111111111 across Pharos Atlantic testnet and mainnet.
```

Direct command:

```bash
node scripts/audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --compare-networks
```

## Console Demo Output

```bash
node scripts/audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --compare-networks --format console --no-explorer
```

## Save Reports

```bash
node scripts/audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --network mainnet --output report.md
node scripts/audit-wallet.mjs --address 0x1111111111111111111111111111111111111111 --network mainnet --output report.json
node scripts/audit-wallet.mjs --addresses-file wallets.csv --compare-networks --format csv --output report.csv
```

## Demo Flow

1. Run a single-wallet markdown audit on `atlantic-testnet`.
2. Run the same wallet with `--format json` to show machine-readable output.
3. Run `--compare-networks --format console` to show a polished terminal comparison.
4. Run `--addresses-file wallets.csv --format csv --output report.csv` to show batch review export.
5. Run `--output report.md` to show report generation for demos or review.
6. Run two wallets together to demonstrate ranking and per-wallet recommendations.
7. Show that the skill never requests a private key and gracefully handles missing explorer history.
