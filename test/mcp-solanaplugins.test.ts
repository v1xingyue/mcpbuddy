import { describe, expect, it } from 'vitest';
import { registerSolanaBasePlugin } from '@/lib/mcp/plugins/solana/base';
import { registerSolanaJupiterPlugin } from '@/lib/mcp/plugins/solana/jupiter';

const context = {
  currentUser: async () => ({ id: 'user-1' }), reviewUiUri: 'ui://mcpbuddy/swap-review.html', reviewUi: '<html></html>',
  reviewOutputSchema: {}, transactionStatusOutputSchema: {}, appOrigin: () => 'https://example.test',
};

function recorder() {
  const calls: Array<{ kind: string; name: string }> = [];
  return { calls, server: { tool: (name: string) => calls.push({ kind: 'tool', name }), registerTool: (name: string) => calls.push({ kind: 'registerTool', name }), registerResource: (name: string) => calls.push({ kind: 'resource', name }) } };
}

describe('Solana MCP tool packages', () => {
  it('keeps base wallet tools separate from Jupiter routing tools', () => {
    const { server, calls } = recorder();
    registerSolanaBasePlugin(server, context);
    registerSolanaJupiterPlugin(server, context);
    expect(calls.filter(call => call.name.includes('swap')).map(call => call.name)).toEqual(['solana-swap-review', 'list_solana_swap_tokens', 'create_solana_swap', 'create_solana_swap_by_mint']);
    expect(calls.map(call => call.name)).toEqual(expect.arrayContaining(['get_wallet_address', 'get_solana_asset_balances', 'create_solana_token_transfer', 'get_solana_transaction_status', 'list_solana_swap_tokens']));
  });
});
