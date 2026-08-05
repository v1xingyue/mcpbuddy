# MCP tool plugin development

MCP tool packages live in `lib/mcp/plugins/<domain>/<package>.ts`. The route owns authentication and composes packages; packages must not inspect bearer tokens, headers, or raw OAuth state.

## Current packages

| Package | Purpose | Tools |
| --- | --- | --- |
| `solana/base` | Bound wallet, portfolio, review/signing workflow | wallet address, balances, native SOL and SPL transfers, transaction status, review card |
| `solana/jupiter` | Read-only routing data and unsigned Jupiter swaps | token discovery, quote, symbol swap, mint swap |
| `hylo/core` | Solana protocol plugin for Hylo token operations through wallet-reviewed unsigned swaps | asset catalog, wallet balances, buy asset, sell asset, operation guide |
| `xstocks/public` | Bounded xStocks API v2 public-data proxy | normalized Solana xStock catalog/detail, list API operations, assets, multiplier, price/supply, reserves, oracles, system status, corporate actions, bridges |

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

## Hylo package

The Hylo package is a Solana protocol plugin and is operation-first. It uses
official Hylo documentation data for live token mints, then builds
Jupiter-routed unsigned buy/sell transactions through the existing Solana
review queue. Amounts are atomic integers because Hylo mints are not part of
the global symbol allowlist and the MCP client must not guess decimals.
`list_hylo_assets` is the supported-asset catalog; `get_hylo_asset_balances`
is the account-scoped wallet holding reader.

Keep native Hylo mint, earn, leverage, and LST staking builders disabled until
the integration is backed by Hylo's SDK or a verified API and can preserve the
same owner-scoped, review-before-signing constraints used by Solana tools.

## xStocks package

`xstocks/public` exposes all sixteen unauthenticated GET operations documented in
xStocks API v2 through a fixed operation allowlist. It accepts only a validated
asset symbol and bounded string query parameters; callers cannot supply a host
or path. Responses are JSON-only and capped at 256 KB.

`list_xstocks({ limit, cursor })` is the normalized catalog for Solana
workflows. It defaults to 50 records (maximum 100) and returns only each
asset's symbol, display name, and Solana mint plus an offset-based
`nextCursor`. Pass that cursor to obtain the next page. `count_xstocks()`
returns the catalog size. `get_xstocks({ symbol })` resolves one symbol to its
Solana deployment plus a public USD quote, Solana multiplier, and Solana oracle
identifier. `get_xstock` remains as a deprecated compatibility alias. The
public xStocks API does not provide Metaplex metadata URIs, so `metadataUri` is
explicitly `null`; its logo URL is not misrepresented as on-chain metadata.

The Solana catalog is stored as one shared public Postgres cache record for 24
hours. This avoids repeatedly resolving stable mint mappings while never
mixing account data. A failed refresh serves the last valid catalog; price,
multiplier, and oracle values in `get_xstock` are still fetched live.

For trading-oriented requests, `list_xstocks_by_volume({ limit })` ranks the
verified Solana catalog by public DexScreener 24-hour USD pair volume and
`get_xstock_market({ symbol })` combines the official xStocks USD price with
that volume. A `null` volume means DexScreener returned no indexed matching
pair; it is not presented as zero volume.

`quote_xstock_swap({ side, symbol, amount, slippageBps })` validates `symbol`
against the verified catalog and asks Jupiter for a read-only USDC/xStock
route. `create_xstock_swap` repeats that validation and creates only the same
account-owned unsigned review record used by all Solana swaps. `buy` amounts
are USDC inputs; `sell` amounts are xStock-token units. It deliberately does
not accept “sell $100 worth” as an exact execution instruction: market price
and route output can move, so the caller must quote and choose an exact token
quantity before creating the wallet-reviewed transaction.

Each account can enable or disable this public package in **Tool list**. The
setting is persisted in `tool_plugin_settings` and enforced again in the MCP
handler after token authentication, so disabling it is not merely a dashboard
display preference.

The xStocks `Client` and `Trades` API groups are intentionally not exposed from
this shared MCP service. Those endpoints require a Backed organization API key
and include wallet whitelisting, RFQs, issuance/redemption, and bridge
operations. A server-wide key would violate MCPBuddy tenant isolation by
exposing one organization's privileged data or authority to another account.
They require a separately designed, per-account encrypted credential store,
explicit user consent UI, account-scoped persistence, and reviewable mutation
workflows before they can be added.
