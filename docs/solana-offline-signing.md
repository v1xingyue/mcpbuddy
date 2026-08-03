# Solana offline signing and broadcast

## Why this flow exists

Solana wallets sign transactions through `signTransaction`. Raw `signMessage` is intended for arbitrary application messages (such as wallet login), and some wallet providers correctly reject it for a transaction message. A server must reject any transaction whose message was changed after review.

## Protocol

1. The server receives a Jupiter-built unsigned wire transaction and stores its exact base64 bytes with the account, short expiry, and review summary.
2. The Account UI deserializes that wire transaction as a `VersionedTransaction` and passes it directly to the wallet's `signTransaction` method.
3. The UI compares the returned message bytes with the original reviewed message before it sends anything to the server.
4. The UI submits both the pre-sign snapshot and the returned signed transaction.
5. The server repeats an exact byte-for-byte message comparison and verifies the fee-payer signature against the bound wallet public key.
6. Only after both checks pass does the server send the wallet-signed wire transaction through `sendTransaction`.

The server never accepts a changed message. This preserves the invariant that the signed and broadcast transaction has the same header, accounts, programs, instruction data, lookup tables, and economics as the reviewed record.

## Security properties

- Private keys remain solely in the user’s wallet.
- A signature for another message, account, or wallet is rejected.
- The signature is checked before broadcast, not merely recorded after a wallet reports success.
- The final RPC payload is accepted only when its message is byte-for-byte equal to the server-stored reviewed message.
- Pending transactions expire after five minutes; transactions older than 45 seconds are requoted before signing because Solana blockhashes are short-lived.

## Wallet compatibility

The wallet must support `signTransaction(VersionedTransaction)`. `signAllTransactions` is used when available; otherwise MCPBuddy prompts sequential transaction approvals. A wallet that returns a transaction with a changed message is rejected locally and by the server; nothing is broadcast.

## Operational checks

Before deploying, run `drizzle/0006_swap_transactions.sql`, configure `SOLANA_RPC_URL`, and run:

```sh
npm run build
npm test
```

The tests prove that the reviewed transaction message and its fee-payer signature are verified before broadcast.
