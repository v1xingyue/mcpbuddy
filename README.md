# MCPBuddy

An account-scoped MCP connection hub for Claude, OpenAI and Grok, designed for Vercel.

中文产品介绍与规划请见 [docs/product-overview.zh-CN.md](docs/product-overview.zh-CN.md)。

## Product model

1. Sign in with GitHub or Google.
2. Create a private MCP endpoint at `/api/mcp` (or a custom subdomain at the edge).
3. Connect that endpoint from Claude, ChatGPT, or Grok.
4. Bind an optional Solana wallet with a signed challenge.
5. Publish pages or upload content through MCP tools.

## Vercel setup

Create GitHub and Google OAuth clients, then add the variables in `.env.example`. The production callback URLs are `https://mcpbuddy.creatorsand.fun/api/auth/callback/github` and `https://mcpbuddy.creatorsand.fun/api/auth/callback/google`. Connect both Vercel Postgres and a **private** Vercel Blob store. Run `npm run build` before deploying.

Run `drizzle/0000_initial.sql` once against Vercel Postgres. The unique `(kind, jti)` constraint gives authorization-code and refresh-token rotation an atomic replay barrier across serverless invocations. Blob is used for publishable file payloads.

`get_solana_asset_balances` reads the bound wallet's configured famous-token list and returns a USD quote for each. The included list covers SOL, USDC, USDT, wSOL, JUP, JTO, PYTH, RAY, WIF, and BONK. Edit [`config/solana-famous-tokens.json`](config/solana-famous-tokens.json) to choose the queried assets; each item requires `symbol`, `name`, `mint` (use `null` for SOL), and `coingeckoId`. Set `SOLANA_RPC_URL` to a production RPC provider endpoint to avoid public-RPC rate limits; when omitted, it uses Solana's public mainnet endpoint. Prices are fetched from CoinGecko and are indicative only.

## Solana swaps

Call `list_solana_swap_tokens()` before creating a trade. It returns the supported mainnet assets with their stable symbols, mint addresses, and decimals. The public MCP tool `create_solana_swap(inputToken, outputToken, amount, slippageBps)` accepts those symbols (for example, `SOL`, `USDC`) and a human-readable decimal amount (for example, `"0.1"`), so an external AI never has to guess a mint or its decimal precision. The server only permits tokens in this allowlist, converts the amount exactly to atomic units, and builds a Jupiter-routed swap for the account's bound wallet. The tool has no signing key and never broadcasts a transaction.

It instead creates a short-lived (about 45 seconds) pending item under **Account → Pending swaps**. This matches Solana's recent-blockhash validity window, so a wallet does not need to refresh the transaction before signing. The signing queue shows the payment, expected and minimum received amount, slippage, fee payer, involved program count, route, and a SHA-256 transaction-message fingerprint. “Review & sign all” uses the connected wallet's `signAllTransactions`, then sends each unchanged signed transaction to the account-scoped submit endpoint. The server verifies that the signed message byte-for-byte matches the reviewed unsigned message before RPC submission.

Run `drizzle/0006_swap_transactions.sql` before enabling this feature. Configure `SOLANA_RPC_URL` with a production RPC endpoint. `JUPITER_API_KEY` is optional for Jupiter API plans that require it; it is sent only server-to-server.

Before enabling Google login, run `drizzle/0003_auth_identities.sql` in the Vercel Postgres SQL editor. It preserves existing GitHub accounts and adds provider-specific identity mapping.

## MCP interactive UI practice

`create_solana_swap` is an end-to-end MCP Apps example. Its tool declaration advertises a `ui://mcpbuddy/swap-review.html` resource through `openai/outputTemplate` (and `ui/resourceUri` for other compatible clients). The resource delivers a sandboxed HTML review card; the tool result carries a short model-visible summary plus `structuredContent` for the card. Clients without MCP Apps UI support retain the same safe text-only workflow.

Try it with an authenticated MCP client:

1. Call `list_solana_swap_tokens()` and select two returned symbols.
2. Call `create_solana_swap`, for example with `SOL`, `USDC`, `"0.01"`, and `50` basis points.
3. Verify that an Apps-capable client renders the unsigned-swap review card. Its action only opens MCPBuddy’s Account page.
4. Inspect the persisted pending swap and sign using the connected wallet. The component never receives a key, transaction bytes, or a signing capability.
