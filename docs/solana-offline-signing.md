# Solana offline signing and broadcast

## Why this flow exists

Some wallet providers reconstruct a `VersionedTransaction` when `signTransaction` is called. That can change transaction header fields, account keys, or instructions. A server must reject that result: accepting it would let a signed transaction differ from the transaction that the user reviewed.

MCPBuddy therefore uses detached signing for pending swaps. The wallet never returns a mutable transaction to the server.

## Protocol

1. The server receives a Jupiter-built unsigned wire transaction and stores its exact base64 bytes with the account, short expiry, and review summary.
2. The Account UI extracts the Solana message bytes from that wire transaction: the compact signature count and reserved 64-byte signature slots are excluded.
3. The wallet calls `signMessage(messageBytes)`. It returns one 64-byte Ed25519 signature.
4. The UI submits only that signature and the pending transaction ID.
5. The server verifies the detached signature against both the stored message bytes and the account’s bound wallet public key.
6. Only after verification, the server writes the signature into the first reserved signature slot of the original stored wire transaction and sends those exact bytes through `sendTransaction`.

The server never accepts a client-supplied replacement transaction on this path. This preserves the invariant that the signed and broadcast transaction has the same header, accounts, programs, instruction data, lookup tables, and economics as the reviewed record.

## Security properties

- Private keys remain solely in the user’s wallet.
- A signature for another message, account, or wallet is rejected.
- The signature is checked before broadcast, not merely recorded after a wallet reports success.
- The final RPC payload is assembled from server-stored bytes, not from a browser-provided transaction.
- Pending transactions expire after five minutes; transactions older than 45 seconds are requoted before signing because Solana blockhashes are short-lived.

## Wallet compatibility

The wallet must support raw Ed25519 `signMessage(Uint8Array)`. MCPBuddy already uses this capability for wallet binding, so a wallet that has successfully bound an account normally supports the signing path. If a wallet prefixes, domain-separates, or otherwise transforms message bytes, its returned signature fails verification and must not be accepted for transaction broadcast.

## Operational checks

Before deploying, run `drizzle/0006_swap_transactions.sql`, configure `SOLANA_RPC_URL`, and run:

```sh
npm run build
npm test
```

The `solana-offline-signing.test.ts` test proves that a verified signature is attached to the unchanged reviewed wire transaction and that a signature from a different wallet is rejected.
