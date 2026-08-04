import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { walletBindings, walletTokenWatchlist } from '@/lib/db/schema';
import { env } from '@/lib/config';
import { getMainSolanaAssetBalances } from '@/lib/solana-assets';
import { createTokenTransferForUser, swapStatusForUser } from '@/lib/solana-swap';
import type { McpPluginContext, McpToolServer } from '@/lib/mcp/plugins/types';

/** Wallet and chain primitives. This package has no Jupiter routing dependency. */
export function registerSolanaBasePlugin(server: McpToolServer, context: McpPluginContext) {
  server.registerResource('solana-swap-review', context.reviewUiUri, { title: 'Solana swap review', description: 'Interactive review card for an unsigned Solana swap.', mimeType: 'text/html+skybridge', _meta: { 'openai/widgetPrefersBorder': true, 'openai/widgetAccessible': true } }, async () => ({ contents: [{ uri: context.reviewUiUri, mimeType: 'text/html+skybridge', text: context.reviewUi }] }));
  server.tool('get_wallet_address', 'Return the verified Solana wallet address bound to the current MCPBuddy account.', {}, async (_args: unknown, extra: any) => {
    const user = await context.currentUser(extra.authInfo?.extra?.githubId);
    const [wallet] = await getDb().select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1);
    return { content: [{ type: 'text', text: wallet?.address ?? 'No Solana wallet is bound to this account yet. Bind one from the MCPBuddy dashboard first.' }] };
  });
  server.tool('get_solana_asset_balances', 'Return balances, current USD prices, and USD valuations for configured and account-whitelisted Solana tokens. Read-only; it cannot sign or submit transactions.', {}, async (_args: unknown, extra: any) => {
    const user = await context.currentUser(extra.authInfo?.extra?.githubId); const db = getDb();
    const [[wallet], watchlist] = await Promise.all([db.select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1), db.select({ mint: walletTokenWatchlist.mint, symbol: walletTokenWatchlist.symbol, name: walletTokenWatchlist.name }).from(walletTokenWatchlist).where(eq(walletTokenWatchlist.userId, user.id))]);
    if (!wallet) return { content: [{ type: 'text', text: 'No Solana wallet is bound to this account yet. Bind one from the MCPBuddy dashboard first.' }] };
    try { const assets = await getMainSolanaAssetBalances(wallet.address, env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com', watchlist.map(item => ({ ...item, decimals: 0, coingeckoId: '' }))); return { content: [{ type: 'text', text: JSON.stringify({ walletAddress: wallet.address, quoteCurrency: 'USD', assets }) }] }; }
    catch (error) { return { content: [{ type: 'text', text: `Could not retrieve Solana asset balances: ${error instanceof Error ? error.message : 'Unknown error.'}` }], isError: true }; }
  });
  server.registerTool('create_solana_token_transfer', { title: 'Create Solana token transfer', description: 'Create an unsigned SPL-token transfer for review and wallet signing. Call list_solana_swap_tokens first; the recipient must already have a token account for this mint.', inputSchema: { token: z.string().min(1).max(20), recipient: z.string().min(32).max(64), amount: z.string().regex(/^\d+(\.\d+)?$/) }, outputSchema: context.reviewOutputSchema, _meta: { 'openai/outputTemplate': context.reviewUiUri, 'ui/resourceUri': context.reviewUiUri } }, async (args: any, extra: any) => {
    try { const user = await context.currentUser(extra.authInfo?.extra?.githubId); const result = await createTokenTransferForUser(user.id, args); const reviewUrl = `${context.appOrigin()}/account/wallet?swap=${result.transactionId}`; return { content: [{ type: 'text', text: `Unsigned ${result.summary.inputAmount} ${result.summary.inputToken} transfer created for ${args.recipient}. Open ${reviewUrl} to review and sign.` }], structuredContent: { ...result, reviewUrl, signingRequired: true }, _meta: { 'openai/outputTemplate': context.reviewUiUri } }; } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not create token transfer.' }], isError: true }; }
  });
  server.registerTool('get_solana_transaction_status', { title: 'Get Solana transaction status', description: 'Read the status of one account-owned pending Solana transaction.', inputSchema: { transactionId: z.string().uuid() }, outputSchema: context.transactionStatusOutputSchema }, async ({ transactionId }: { transactionId: string }, extra: any) => {
    try { const user = await context.currentUser(extra.authInfo?.extra?.githubId); const result = await swapStatusForUser(user.id, transactionId); return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }; } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not read transaction status.' }], isError: true }; }
  });
}
