import { xstocksPublicOperations } from '@/lib/xstocks';

export type McpToolCatalogItem = { name: string; description: string };
export type McpPluginCatalogItem = { id: string; label: string; category: string; summary: string; tools: McpToolCatalogItem[]; controllable?: boolean };

/**
 * Dashboard-facing description of the MCP surface. Keep it server-side so the
 * browser cannot drift from package configuration. xStocks endpoint details are
 * generated directly from its API allowlist rather than copied into JSX.
 */
export function mcpToolCatalog(): McpPluginCatalogItem[] {
  return [
    { id: 'account/core', label: 'Account core', category: 'Account', summary: 'Identity, client confirmation, and the private AI Context Pack.', tools: [
      { name: 'user_info()', description: 'Read the private AI Context Pack.' }, { name: 'hello(platform)', description: 'Confirm a connected AI client.' },
    ] },
    { id: 'solana/base', label: 'Solana base', category: 'Solana', summary: 'Wallet lookup, token balances, unsigned transfers, and transaction status.', tools: [
      { name: 'get_wallet_address()', description: 'Return the bound Solana wallet.' }, { name: 'get_solana_asset_balances()', description: 'Read token balances and USD values.' }, { name: 'create_solana_sol_transfer(recipient, amount)', description: 'Create a native-SOL transfer for wallet review.' }, { name: 'create_solana_token_transfer(token, recipient, amount)', description: 'Create an SPL-token transfer for wallet review.' }, { name: 'get_solana_transaction_status(transactionId)', description: 'Read an account-owned pending transaction status.' },
    ] },
    { id: 'solana/jupiter', label: 'Solana Jupiter', category: 'Solana', summary: 'Jupiter route discovery, quotes, and unsigned swap creation.', tools: [
      { name: 'list_solana_swap_tokens()', description: 'List currently quoteable symbols, mints, and decimals.' }, { name: 'quote_solana_swap(inputToken, outputToken, amount, slippageBps)', description: 'Get a read-only route and expected output before creating a swap.' }, { name: 'create_solana_swap(inputToken, outputToken, amount, slippageBps)', description: 'Create a Jupiter swap for wallet review.' }, { name: 'create_solana_swap_by_mint(inputMint, outputMint, amount)', description: 'Create a Jupiter swap by mint; amount is atomic.' },
    ] },
    { id: 'hylo/core', label: 'Hylo operations', category: 'Solana', summary: 'Solana protocol tools for Hylo buy/sell operations through wallet review.', tools: [
      { name: 'list_hylo_assets(category)', description: 'List live Hylo asset symbols and mints before an operation.' }, { name: 'get_hylo_asset_balances()', description: 'Read Hylo token balances in the bound Solana wallet.' }, { name: 'create_hylo_buy_asset(assetSymbol, inputMint, inputAmountAtomic, slippageBps)', description: 'Create an unsigned swap into a Hylo asset for wallet review.' }, { name: 'create_hylo_sell_asset(assetSymbol, outputMint, assetAmountAtomic, slippageBps)', description: 'Create an unsigned swap out of a Hylo asset for wallet review.' }, { name: 'get_hylo_operation_guide(operation)', description: 'Show the matching Hylo MCP operation.' },
    ] },
    { id: 'xstocks/public', label: 'xStocks public data', category: 'Markets', summary: `Official xStocks API v2 public data (${xstocksPublicOperations.length} allowlisted operations); read-only, no API key or trading authority.`, controllable: true, tools: [
      { name: 'list_xstocks_public_operations()', description: `List the ${xstocksPublicOperations.length} live xStocks API operations.` },
      { name: 'get_xstocks_public_data(operation, symbol?, query?)', description: `Call one xStocks operation: ${xstocksPublicOperations.map(operation => operation.id).join(', ')}.` },
    ] },
    { id: 'content/pages', label: 'Content pages', category: 'Content', summary: 'Account-owned Markdown and public HTML publishing tools.', tools: [
      { name: 'publish_page(slug, title, content, public)', description: 'Publish an account-owned Markdown page.' }, { name: 'publish_html(html)', description: 'Publish a standalone HTML document and return its public URL.' }, { name: 'list_pages()', description: 'List available pages.' }, { name: 'get_page_content(id | title)', description: 'Read one page by ID or title.' },
    ] },
  ];
}
