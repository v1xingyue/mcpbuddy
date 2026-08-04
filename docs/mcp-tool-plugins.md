# MCP tool plugin development

MCP tool packages live in `lib/mcp/plugins/<domain>/<package>.ts`. The route owns authentication and composes packages; packages must not inspect bearer tokens, headers, or raw OAuth state.

## Current Solana packages

| Package | Purpose | Tools |
| --- | --- | --- |
| `solana/base` | Bound wallet, portfolio, review/signing workflow | wallet address, balances, native SOL and SPL transfers, transaction status, review card |
| `solana/jupiter` | Read-only routing data and unsigned Jupiter swaps | token discovery, quote, symbol swap, mint swap |

The shared famous-token catalog lives in
`config/solana-famous-tokens.json`. It is consumed by both packages: Base uses
it for portfolio balance discovery, while Jupiter uses it as the symbol
allowlist for quote and swap tools. Keep entries conservative and verified:
`symbol`, `name`, `mint`, `decimals`, and `coingeckoId` are required;
`category` and `tags` are optional metadata for UI/client grouping. Do not add
a token unless its mint and decimals are known, because configured symbols form
part of the public MCP contract.

## Adding a tool

1. Put registrations in the narrowest domain package and call its exported registration function.
2. Validate every input with Zod. IDs are locators only: derive the user through `context.currentUser` and apply `userId` to every data access or mutation.
3. Mutations need a useful text fallback and safe `isError` failures. Only pass display-safe data to MCP Apps cards.
4. The server can build and store an unsigned Solana transaction, but cannot hold a private key or sign. New records must be owner-scoped and retain review-before-sign.
5. Update the dashboard catalog, public documentation, and focused Vitest coverage.

Each registration function receives an opaque MCP server plus constrained context from `lib/mcp/plugins/types.ts`. Keep shared context minimal; never pass secrets, reusable authorizations, signed transaction bytes, or raw database access to an Apps UI. Run `npm test` and `npm run build` before submitting changes.
