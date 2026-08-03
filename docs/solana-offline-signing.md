# Solana offline signing and broadcast

## Why this flow exists

Solana wallets sign transactions through `signTransaction`. Raw `signMessage` is intended for arbitrary application messages (such as wallet login), and some wallet providers correctly reject it for a transaction message.

## Protocol

1. The server receives a Jupiter-built v0 unsigned wire transaction and stores its exact base64 bytes with the account, short expiry, and review summary.
2. The Account UI deserializes that wire transaction as a `VersionedTransaction` and passes it directly to the wallet's `signTransaction` method.
3. The UI submits both the pre-sign snapshot and the signed transaction returned by the wallet.
4. The server verifies that the browser started with the reviewed pending item, then sends the wallet-signed wire transaction through `sendTransaction`.

## Compatibility mode: no post-signing message check

MCPBuddy currently does **not** compare the transaction message returned after wallet signing with the reviewed v0 message, and it does not verify the returned fee-payer signature before RPC submission. This permits wallet providers that reconstruct a v0 transaction as legacy to complete a swap.

This is a deliberate compatibility trade-off. It removes the guarantee that the transaction broadcast by MCPBuddy is byte-for-byte the transaction shown in the review card. A malicious, compromised, or buggy wallet/provider could return a different signed transaction; it will be sent to the RPC endpoint. The wallet confirmation screen is therefore the final source of truth for transaction contents. Restore post-signing message and signature verification when the wallet/provider preserves v0 transactions.

## Security properties

- Private keys remain solely in the user’s wallet.
- Private keys remain solely in the user's wallet, and RPC preflight still validates the signed transaction before execution.
- The server retains the pre-sign snapshot check to prevent a stale page from submitting a transaction for a different pending record.
- **Not guaranteed in compatibility mode:** the post-signing transaction message, fee payer, and signature are not checked by MCPBuddy before broadcast.
- Pending transactions expire after five minutes; transactions older than 45 seconds are requoted before signing because Solana blockhashes are short-lived.

## Wallet compatibility

The wallet must support `signTransaction(VersionedTransaction)`. `signAllTransactions` is used when available; otherwise MCPBuddy prompts sequential transaction approvals. A wallet may return legacy output or a changed v0 message in compatibility mode, and MCPBuddy will submit that returned transaction directly.

## Operational checks

Before deploying, run `drizzle/0006_swap_transactions.sql`, configure `SOLANA_RPC_URL`, and run:

```sh
npm run build
npm test
```

The post-signing equivalence checks are intentionally disabled in compatibility mode; validate the wallet confirmation screen carefully before approving.
