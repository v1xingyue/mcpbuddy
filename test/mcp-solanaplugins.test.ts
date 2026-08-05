import { describe, expect, it } from 'vitest';
import { registerSolanaBasePlugin } from '@/lib/mcp/plugins/solana/base';
import { registerSolanaJupiterPlugin } from '@/lib/mcp/plugins/solana/jupiter';
import { registerXstocksPublicPlugin } from '@/lib/mcp/plugins/xstocks/public';

const context = {
  currentUser: async () => ({ id: 'user-1' }), reviewUiUri: 'ui://mcpbuddy/swap-review.html', reviewUi: '<html></html>',
  reviewOutputSchema: {}, transactionStatusOutputSchema: {}, appOrigin: () => 'https://example.test',
};

function recorder() {
  const calls: Array<{ kind: string; name: string; definition?: { description?: string } }> = [];
  return { calls, server: { tool: (name: string) => calls.push({ kind: 'tool', name }), registerTool: (name: string, definition: { description?: string }) => calls.push({ kind: 'registerTool', name, definition }), registerResource: (name: string) => calls.push({ kind: 'resource', name }) } };
}

describe('Solana MCP tool packages', () => {
  it('keeps base wallet tools separate from Jupiter routing tools', () => {
    const { server, calls } = recorder();
    registerSolanaBasePlugin(server, context);
    registerSolanaJupiterPlugin(server, context);
    expect(calls.filter(call => call.name.includes('swap')).map(call => call.name)).toEqual(['solana-swap-review', 'quote_solana_swap', 'list_solana_swap_tokens', 'create_solana_swap', 'create_solana_swap_by_mint']);
    expect(calls.map(call => call.name)).toEqual(expect.arrayContaining(['get_wallet_address', 'get_solana_asset_balances', 'create_solana_sol_transfer', 'create_solana_token_transfer', 'get_solana_transaction_status', 'list_solana_swap_tokens', 'quote_solana_swap']));
  });

  it('registers the bounded xStocks public data tools', () => {
    const { server, calls } = recorder();
    registerXstocksPublicPlugin(server, context);
    expect(calls.map(call => call.name)).toEqual(['list_xstocks_by_volume', 'get_xstock_market', 'quote_xstock_swap', 'create_xstock_swap', 'search_xstocks']);
  });

  it('tells MCP clients to preserve user-supplied mint identities', () => {
    const { server, calls } = recorder();
    registerSolanaJupiterPlugin(server, context);
    const mintSwap = calls.find(call => call.name === 'create_solana_swap_by_mint');
    expect(mintSwap?.definition?.description).toContain('never infer, replace, or select a mint from a token name or symbol');
    expect(mintSwap?.definition?.description).toContain('atomic integer');
  });
});
