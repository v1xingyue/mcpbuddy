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
