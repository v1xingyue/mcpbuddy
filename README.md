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

`publish_html(html)` accepts one complete HTML document (up to 1 MB) and returns a direct Vercel Blob public URL with `text/html` content type. The URL is publicly accessible and the document is deliberately served from the isolated Blob origin rather than the MCPBuddy app origin. Do not publish secrets, private data, or reusable credentials.

`get_solana_asset_balances` reads the bound wallet's configured famous-token list plus tokens in the current account's wallet whitelist, returning a USD quote where available. The included list covers SOL, USDC, USDT, wSOL, JUP, JTO, PYTH, RAY, ORCA, W, WIF, and BONK, grouped by categories such as Native, Stablecoin, DeFi, Infrastructure, Staking, Wrapped, and Meme. Whitelisted tokens are account-scoped, are included only when their balance is nonzero, and may have no USD quote. When CoinGecko has no quote, MCPBuddy requests a read-only Jupiter route quote for exactly one token into USDC (for example, 1 SPACEX → 90.14 USDC); it neither creates nor signs a transaction. `list_solana_swap_tokens` also includes a current-account whitelist token when Jupiter can quote it; its on-chain/Jupiter decimal metadata is resolved before it can be used by the symbol-based swap or transfer tools, and configured tokens include `category` and `tags` metadata for client grouping. Edit [`config/solana-famous-tokens.json`](config/solana-famous-tokens.json) to choose the queried assets; each item requires `symbol`, `name`, `mint` (use `null` for SOL), `decimals`, and `coingeckoId`, with optional `category` and `tags`. Set `SOLANA_RPC_URL` to a production RPC provider endpoint to avoid public-RPC rate limits; when omitted, it uses Solana's public mainnet endpoint. Prices are fetched from CoinGecko and are indicative only.

## Solana swaps

### MCP tool packages

MCP tool registration is organized as packages under `lib/mcp/plugins/`. The
`solana/base` package contains bound-wallet, portfolio, unsigned SPL transfer,
transaction-status, and MCP Apps review-card capabilities. The
`solana/jupiter` package contains live Jupiter route discovery plus unsigned
symbol- and mint-based swap creation. Both packages receive the authenticated
user only through the route's verified MCP context; neither has a private key
or can sign or broadcast a transaction.

`hylo/core` exposes read-only Hylo protocol discovery tools:
`list_hylo_assets`, `get_hylo_onchain_addresses`,
`get_hylo_operation_guide`, and `get_hylo_developer_resources`. The tools list
documented Hylo assets such as hyUSD, eHYUSD, hyloSOL, hyloSOL+, xSOL, and
cbBTC, return official Solana program and mint addresses, and point users to
the Hylo app/docs/SDK. Hylo documentation says public APIs are coming soon, so
MCPBuddy does not currently build, sign, or submit Hylo transactions.

The base package also supports `create_solana_sol_transfer(recipient, amount)`
for native SOL. It creates the same five-minute, account-owned unsigned review
record as an SPL transfer. The Jupiter package offers
`quote_solana_swap(inputToken, outputToken, amount, slippageBps)` for a
read-only expected/minimum-output quote before `create_solana_swap`; quoting
does not create any pending transaction. See
[plugin development](docs/mcp-tool-plugins.md) for package boundaries and the
checklist for adding tools.

Call `list_solana_swap_tokens()` before creating a trade. It returns the supported mainnet assets with their stable symbols, mint addresses, and decimals. The public MCP tool `create_solana_swap(inputToken, outputToken, amount, slippageBps)` accepts those symbols (for example, `SOL`, `USDC`) and a human-readable decimal amount (for example, `"0.1"`), so an external AI never has to guess a mint or its decimal precision. The server only permits tokens in this allowlist, converts the amount exactly to atomic units, and builds a Jupiter-routed swap for the account's bound wallet. The tool has no signing key and never broadcasts a transaction.

It instead creates a five-minute pending item under **Account → Pending swaps**. Solana transaction blockhashes are much shorter-lived, so MCPBuddy refreshes an older transaction immediately before signing and asks the user to review the refreshed quote; it never silently changes a transaction that is about to be signed. The signing queue shows the payment, expected and minimum received amount, slippage, fee payer, involved program count, route, and a SHA-256 transaction-message fingerprint. The wallet signs the exact Solana message bytes offline; MCPBuddy verifies the 64-byte signature against the bound wallet, attaches it to the server-stored wire transaction, then broadcasts those exact reviewed bytes. See [offline-signing design](docs/solana-offline-signing.md) for the protocol and security invariants.

Run `drizzle/0006_swap_transactions.sql` before enabling this feature. Configure `SOLANA_RPC_URL` with a production RPC endpoint. `JUPITER_API_KEY` is optional for Jupiter API plans that require it; it is sent only server-to-server.

Before enabling Google login, run `drizzle/0003_auth_identities.sql` in the Vercel Postgres SQL editor. It preserves existing GitHub accounts and adds provider-specific identity mapping.

## MCP interactive UI practice

`create_solana_swap` is an end-to-end MCP Apps example. Its tool declaration advertises a `ui://mcpbuddy/swap-review.html` resource through `openai/outputTemplate` (and `ui/resourceUri` for other compatible clients). The resource delivers a sandboxed HTML review card; the tool result carries a short model-visible summary plus `structuredContent` for the card. Clients without MCP Apps UI support retain the same text-only workflow. See [MCP UI return and deep-link flow](docs/mcp-app-ui-return.md) for the complete design.

Try it with an authenticated MCP client:

1. Call `list_solana_swap_tokens()` and select two returned symbols.
2. Call `create_solana_swap`, for example with `SOL`, `USDC`, `"0.01"`, and `50` basis points.
3. Verify that an Apps-capable client renders the unsigned-swap review card. Its action only opens MCPBuddy’s Account page.
4. Inspect the persisted pending swap and sign using the connected wallet. The component never receives a key, transaction bytes, or a signing capability.
