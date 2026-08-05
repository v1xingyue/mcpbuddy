import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { toolPluginSettings } from '@/lib/db/schema';
import { findSolanaXstock, getXstockMarket, listXstocksByVolume, listXstocksPage } from '@/lib/xstocks';
import { createSwapByMintForUser, quoteSolanaSwapByMint, solanaTokenMetadata, toAtomicAmount } from '@/lib/solana-swap';
import type { McpPluginContext, McpToolServer } from '@/lib/mcp/plugins/types';

/** xStocks API v2 public data. No API key, wallet capability, or trade action is exposed. */
async function xstocksEnabledForUser(userId: string) {
  const [setting] = await getDb().select({ enabled: toolPluginSettings.enabled }).from(toolPluginSettings)
    .where(and(eq(toolPluginSettings.userId, userId), eq(toolPluginSettings.pluginId, 'xstocks/public'))).limit(1);
  return setting?.enabled ?? true;
}

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const tradeInputSchema = { side: z.enum(['buy', 'sell']), symbol: z.string().trim().regex(/^[A-Za-z0-9._-]{1,32}$/), amount: z.string().regex(/^\d+(\.\d+)?$/), slippageBps: z.number().int().min(1).max(1000).default(50) };

async function xstockTradeArgs(args: { side: 'buy' | 'sell'; symbol: string; amount: string; slippageBps: number }) {
  const asset = await findSolanaXstock(args.symbol);
  const metadata = await solanaTokenMetadata(asset.mint);
  const xstockDecimals = metadata?.decimals ?? -1;
  if (!Number.isInteger(xstockDecimals) || xstockDecimals < 0 || xstockDecimals > 18) throw new Error(`Could not resolve verified on-chain decimals for ${asset.symbol}; trading is unavailable until Jupiter token metadata is available.`);
  const inputToken = args.side === 'buy' ? 'USDC' : asset.symbol;
  const outputToken = args.side === 'buy' ? asset.symbol : 'USDC';
  const inputMint = args.side === 'buy' ? USDC_MINT : asset.mint;
  const outputMint = args.side === 'buy' ? asset.mint : USDC_MINT;
  const inputDecimals = args.side === 'buy' ? 6 : xstockDecimals;
  const outputDecimals = args.side === 'buy' ? xstockDecimals : 6;
  return { asset, inputToken, outputToken, inputMint, outputMint, inputDecimals, outputDecimals, amount: args.amount, slippageBps: args.slippageBps };
}

export function registerXstocksPublicPlugin(server: McpToolServer, context: McpPluginContext) {
  server.registerTool('list_xstocks_by_volume', {
    title: 'List top Solana xStocks by 24-hour volume',
    description: 'List verified Solana xStocks ranked by public DEX 24-hour USD volume. Volume is aggregated across DexScreener Solana pairs and is unavailable when no indexed pair is returned.',
    inputSchema: { limit: z.number().int().min(1).max(10).default(10) },
    outputSchema: { xstocks: z.array(z.object({ symbol: z.string(), name: z.string(), mint: z.string(), chain: z.literal('solana'), volume24hUsd: z.number(), volumeSource: z.literal('dexscreener') })) },
  }, async (args: { limit: number }, extra: any) => {
    try { const user = await context.currentUser(extra.authInfo?.extra?.githubId); if (!await xstocksEnabledForUser(user.id)) return { content: [{ type: 'text', text: 'xStocks public tools are disabled for this MCPBuddy account. Enable them in Tool list.' }], isError: true }; const xstocks = await listXstocksByVolume(args.limit); return { content: [{ type: 'text', text: JSON.stringify({ xstocks }) }], structuredContent: { xstocks } }; }
    catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not retrieve xStocks market volume.' }], isError: true }; }
  });

  server.registerTool('get_xstock_market', {
    title: 'Get xStock price and 24-hour volume',
    description: 'Get one verified Solana xStock’s official USD price and public DEX 24-hour USD trading volume. A null volume means the DEX index returned no matching pair, not zero volume.',
    inputSchema: { symbol: z.string().trim().regex(/^[A-Za-z0-9._-]{1,32}$/) },
    outputSchema: { symbol: z.string(), name: z.string(), mint: z.string(), chain: z.literal('solana'), price: z.number(), volume24hUsd: z.number().nullable(), volumeSource: z.literal('dexscreener'), fetchedAt: z.string().datetime() },
  }, async (args: { symbol: string }, extra: any) => {
    try { const user = await context.currentUser(extra.authInfo?.extra?.githubId); if (!await xstocksEnabledForUser(user.id)) return { content: [{ type: 'text', text: 'xStocks public tools are disabled for this MCPBuddy account. Enable them in Tool list.' }], isError: true }; const xstock = await getXstockMarket(args.symbol); return { content: [{ type: 'text', text: JSON.stringify(xstock) }], structuredContent: xstock }; }
    catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not retrieve xStock market data.' }], isError: true }; }
  });

  server.registerTool('quote_xstock_swap', {
    title: 'Quote xStock buy or sell',
    description: 'Fetch a read-only Jupiter route for buying an xStock with an exact USDC input, or selling an exact xStock-token input for USDC. For buy, amount is USDC; for sell, amount is xStock units—not a USDC value. It does not create, sign, or broadcast a transaction.',
    inputSchema: tradeInputSchema,
    outputSchema: { inputToken: z.string(), outputToken: z.string(), inputAmount: z.string(), inputAmountAtomic: z.string(), expectedOutput: z.string(), expectedOutputAtomic: z.string(), minimumOutput: z.string(), minimumOutputAtomic: z.string(), slippageBps: z.number(), priceImpactPct: z.string().nullable(), route: z.array(z.string()), quotedAt: z.string().datetime() },
  }, async (args: { side: 'buy' | 'sell'; symbol: string; amount: string; slippageBps: number }, extra: any) => {
    try { const user = await context.currentUser(extra.authInfo?.extra?.githubId); if (!await xstocksEnabledForUser(user.id)) return { content: [{ type: 'text', text: 'xStocks public tools are disabled for this MCPBuddy account. Enable them in Tool list.' }], isError: true }; const trade = await xstockTradeArgs(args); const quote = await quoteSolanaSwapByMint(trade); return { content: [{ type: 'text', text: JSON.stringify(quote) }], structuredContent: quote }; }
    catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not quote xStock swap.' }], isError: true }; }
  });

  server.registerTool('create_xstock_swap', {
    title: 'Create xStock buy or sell for wallet review',
    description: 'Create a Jupiter-routed, unsigned xStock swap for the bound wallet. For buy, amount is exact USDC input; for sell, amount is exact xStock-token input. It creates an account-owned pending review only: MCPBuddy never receives a private key and never broadcasts without the user’s wallet signature.',
    inputSchema: tradeInputSchema,
    outputSchema: context.reviewOutputSchema, _meta: { 'openai/outputTemplate': context.reviewUiUri, 'ui/resourceUri': context.reviewUiUri },
  }, async (args: { side: 'buy' | 'sell'; symbol: string; amount: string; slippageBps: number }, extra: any) => {
    try { const user = await context.currentUser(extra.authInfo?.extra?.githubId); if (!await xstocksEnabledForUser(user.id)) return { content: [{ type: 'text', text: 'xStocks public tools are disabled for this MCPBuddy account. Enable them in Tool list.' }], isError: true }; const trade = await xstockTradeArgs(args); const result = await createSwapByMintForUser(user.id, { inputMint: trade.inputMint, outputMint: trade.outputMint, amount: toAtomicAmount(trade.amount, trade.inputDecimals), slippageBps: trade.slippageBps }); return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }; }
    catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not create xStock swap.' }], isError: true }; }
  });
  server.registerTool('search_xstocks', {
    title: 'Search Solana xStocks',
    description: 'Search the verified Solana xStock catalog by ticker or name. Use this to find a symbol before requesting market data, a route quote, or a wallet-reviewed trade. Results are capped at 20 compact records; mint addresses remain server-side.',
    inputSchema: { query: z.string().trim().min(1).max(60).optional(), limit: z.number().int().min(1).max(20).default(10), cursor: z.string().regex(/^\d{1,6}$/).optional() },
    outputSchema: { total: z.number().int().nonnegative(), xstocks: z.array(z.object({ symbol: z.string(), name: z.string() })).max(20), nextCursor: z.string().nullable() },
  }, async (args: { query?: string; limit: number; cursor?: string }, extra: any) => {
    try { const user = await context.currentUser(extra.authInfo?.extra?.githubId); if (!await xstocksEnabledForUser(user.id)) return { content: [{ type: 'text', text: 'xStocks public tools are disabled for this MCPBuddy account. Enable them in Tool list.' }], isError: true }; const page = await listXstocksPage(args); return { content: [{ type: 'text', text: `${page.total} matching xStocks. ${page.xstocks.map(item => `${item.symbol} (${item.name})`).join(', ') || 'No matches.'}` }], structuredContent: page }; }
    catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not search xStocks.' }], isError: true }; }
  });
}
