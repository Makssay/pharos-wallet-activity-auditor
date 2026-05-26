# Example Prompts

## Single Wallet

```text
Use $pharos-wallet-activity-auditor to audit 0x1111111111111111111111111111111111111111 on Pharos Atlantic testnet. Show a concise markdown report.
```

## Multi-Wallet Comparison

```text
Use $pharos-wallet-activity-auditor to compare these Pharos wallets and rank them by activity readiness: 0x1111111111111111111111111111111111111111, 0x2222222222222222222222222222222222222222.
```

## JSON Output

```text
Use $pharos-wallet-activity-auditor to generate JSON for 0x1111111111111111111111111111111111111111 on mainnet.
```

## Demo Flow

1. Run a single-wallet markdown audit on `atlantic-testnet`.
2. Run the same wallet with `--format json` to show machine-readable output.
3. Run two wallets together to demonstrate ranking and per-wallet recommendations.
4. Show that the skill never requests a private key and gracefully handles missing explorer history.
