# Activity Score

The score is a compact readiness heuristic from 0 to 100. It is intended for wallet triage, not campaign eligibility or Sybil detection.

## Components

| Signal | Points | Rationale |
| --- | ---: | --- |
| Native balance above zero | 25 | Wallet can hold chain-native assets. |
| Outgoing transaction count | 0-35 | Nonce is a cheap activity proxy. |
| Known non-zero token balance | 20 | Wallet has interacted with or received known ecosystem assets. |
| Can pay simple gas | 15 | Native balance covers `gasPrice * 21000`. |
| Contract account marker | 5 | Contract wallets/deployments can be meaningful activity. |

## Nonce Points

| Transaction count | Points |
| ---: | ---: |
| 0 | 0 |
| 1-2 | 15 |
| 3-9 | 25 |
| 10+ | 35 |

## Labels

| Score | Label |
| ---: | --- |
| 80-100 | Active |
| 50-79 | Warm |
| 20-49 | Starter |
| 0-19 | New or empty |

## Guidance

- Explain that low score usually means the wallet needs funding or basic onchain activity.
- Do not claim that a high score guarantees any reward, airdrop, whitelist, or campaign acceptance.
- When comparing wallets, sort by score descending and call out the specific missing signals for each wallet.
