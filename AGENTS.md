# MCPBuddy agent guide

## Purpose and scope

MCPBuddy is an account-scoped MCP connection hub deployed on Vercel. It provides
OAuth-protected Streamable HTTP MCP tools, private/public Markdown pages, and
optional Solana wallet features. Changes must preserve tenant isolation and must
never introduce server-side wallet signing.

## Stack and layout

- Next.js 15 App Router, React 19, TypeScript, Zod, Vitest.
- Vercel Postgres via Drizzle; Vercel Blob for page payloads.
- Auth.js / NextAuth for GitHub, Google, and Solana wallet sign-in.
- MCP route and tool definitions: `app/api/mcp/route.ts`.
- OAuth endpoints: `app/oauth/**`; auth and provisioning: `auth.ts`, `app/actions.ts`.
- Database schema: `lib/db/schema.ts`; additive SQL migrations: `drizzle/*.sql`.
- Solana pricing/assets: `lib/solana-assets.ts`; transaction construction and
  submission: `lib/solana-swap.ts`; wallet UI: `components/pending-swaps-panel.tsx`.
- Shared UI tokens/primitives: `app/ui-system.css`; feature CSS belongs next to
  its app-level concern. See `docs/ui-foundation.md`.

Use the `@/` import alias. Keep server-only logic out of client components and
do not add a component library or CSS framework without an explicit request.

## Required workflow

1. Inspect the affected route, library, schema/migration, tests, and relevant
   documentation before changing behavior.
2. Make the smallest coherent change. Preserve unrelated working-tree edits.
3. Add or update focused Vitest coverage for changed parsing, authorization,
   persistence, or transaction behavior.
4. Run `npm test` and `npm run build` for production-affecting changes. Report
   any command that cannot run and why; do not claim it passed.
5. Update README or the relevant `docs/` design document whenever the public
   MCP contract, environment setup, OAuth behavior, or signing flow changes.

Useful commands:

```sh
npm test
npm run build
npm run dev
```

## Git push requirement

After every completed change, commit the relevant files and push the current
branch to GitHub. Before pushing, enable the local proxy for that command:

```sh
export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890 all_proxy=socks5://127.0.0.1:7890
git push
```

There is no separate lint configuration in this repository; do not treat
`npm run lint` as a required validation command unless it is repaired first.

## Security invariants — do not weaken

### Identity, OAuth, and data access

- Every user-owned read, update, delete, or MCP tool action must derive the
  current user from verified authentication and filter database operations by
  `userId`. An ID, slug, deep link, or MCP transaction ID is a locator, never
  authorization.
- Preserve OAuth 2.1 / PKCE validation, redirect URI validation, token expiry,
  and one-time token/challenge replay barriers. The database uniqueness barrier
  is intentional because concurrent serverless invocations are possible.
- Do not implicitly merge users by email. Account linking and merging must stay
  explicit and confirmed by the signed-in user.
- Keep credentials, bearer tokens, authorization codes, signed transactions,
  database URLs, Blob tokens, and private user content out of logs, tool text,
  structured MCP output, client props, source control, and documentation.
- Never read, modify, add, or commit `.env*` files. Use `.env.example` only for
  documenting new required configuration, and validate new values in
  `lib/config.ts`.

### MCP tools and Apps UI

- Validate all tool inputs with Zod and make descriptions, text fallbacks, and
  structured outputs precise. A client without MCP Apps UI must still be able to
  understand the result safely.
- Treat MCP Apps cards as sandboxed display/navigation surfaces. They must not
  receive secrets, wallet capabilities, or raw reusable authorization material.
  Deep links must be same-origin/HTTPS and opened with `noopener`.
- Any newly exposed or mutating tool needs a clear authorization boundary,
  account-scoped queries, bounded inputs, and tests for rejection paths.

### Solana

- Private keys remain exclusively in the user wallet. The server may build,
  store for review, validate, and submit a wallet-signed transaction; it must
  never sign for a user.
- Only use configured/validated token identities and exact decimal-to-atomic
  conversion. Do not accept guessed mints or floating-point amounts on public
  tool paths.
- Preserve the review-before-signing workflow: pending records are
  account-owned, short-lived, and refreshed as new records rather than silently
  modified. Do not expand a transaction's scope after the user has reviewed it.
- The current post-signing compatibility trade-off is documented in
  `docs/solana-offline-signing.md`. Do not present byte-for-byte post-signing
  equivalence as guaranteed unless verification is actually implemented and
  tested.

## Database and API conventions

- Schema changes require a new, forward-only numbered SQL migration in
  `drizzle/` and the matching Drizzle schema update. Do not rewrite migrations
  that may already be deployed.
- Prefer database constraints and conditional/account-scoped mutations for
  correctness under concurrency; application-only checks are insufficient for
  replay prevention and state transitions.
- Return safe, actionable errors to clients. Keep provider response bodies
  bounded before including them in an error message.
- Public pages must remain explicitly marked public; private page access must
  remain owner-scoped.

## UI conventions

- Use semantic `--ui-*` tokens and shared `.ui-*` primitives where applicable.
  Add a shared primitive only when at least two screens need it.
- Maintain accessible labels, keyboard/focus behavior, reduced-motion-aware
  interactions, and responsive layouts. Do not make security-sensitive actions
  ambiguous or automatic.

## Definition of done

A change is complete only when its authorization model, validation, schema
impact, user-facing fallback/error states, tests, and documentation have been
considered. For changes involving OAuth, MCP mutation, persistence, or Solana,
state explicitly which security invariants were preserved and what was tested.
