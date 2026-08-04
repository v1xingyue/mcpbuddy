import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { env } from '@/lib/config';
import { getDb } from '@/lib/db';
import { walletBindings } from '@/lib/db/schema';
import { getMainSolanaAssetBalances } from '@/lib/solana-assets';
import type { McpPluginContext, McpToolServer } from '@/lib/mcp/plugins/types';
import { HYLO_DOCS_URL, WSOL_MINT, hyloAssets, hyloOperations, liveHyloAsset } from '@/lib/hylo';
import { createSwapByMintForUser } from '@/lib/solana-swap';

const assetCategorySchema = z.enum(['stablecoin', 'earn', 'lst', 'xasset', 'collateral']).optional();
const operationSchema = z.enum(['buy_asset', 'sell_asset', 'native_hylo']);
const mintSchema = z.string().min(32).max(64).describe(`A Solana mint address. Use ${WSOL_MINT} for SOL.`);
const atomicAmountSchema = z.string().regex(/^\d+$/).describe('Positive atomic integer amount, not a display decimal. For example, 0.5 USDC is "500000".');

function reviewUrl(context: McpPluginContext, transactionId: string) {
  return `${context.appOrigin()}/account/wallet?swap=${transactionId}`;
}

/** Hylo operation tools. Swap tools build unsigned transactions only; the user signs in their wallet. */
export function registerHyloCorePlugin(server: McpToolServer, context: McpPluginContext) {
  server.registerTool('list_hylo_assets', {
    title: 'List Hylo assets',
    description: 'List Hylo protocol assets that can be targeted by Hylo operation tools. Read this before buying or selling a Hylo asset.',
    inputSchema: { category: assetCategorySchema },
    outputSchema: {
      assets: z.array(z.object({
        symbol: z.string(),
        name: z.string(),
        category: z.string(),
        status: z.string(),
        mint: z.string().nullable(),
        description: z.string(),
        appUrl: z.string().url(),
        docsUrl: z.string().url(),
      })),
    },
  }, async ({ category }: { category?: string }) => {
    const assets = category ? hyloAssets.filter(asset => asset.category === category) : hyloAssets;
    return { content: [{ type: 'text', text: JSON.stringify({ assets }) }], structuredContent: { assets } };
  });

  server.registerTool('get_hylo_asset_balances', {
    title: 'Get Hylo asset balances',
    description: 'Read the bound wallet balance for live Hylo token mints. Read-only; it cannot sign or submit transactions.',
    inputSchema: {},
    outputSchema: {
      walletAddress: z.string(),
      assets: z.array(z.object({
        symbol: z.string(),
        name: z.string(),
        category: z.string().optional(),
        mint: z.string().nullable(),
        balance: z.string(),
        priceUsd: z.number().nullable(),
        valueUsd: z.number().nullable(),
      })),
    },
  }, async (_args: unknown, extra: any) => {
    const user = await context.currentUser(extra.authInfo?.extra?.githubId);
    const [wallet] = await getDb().select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1);
    if (!wallet) return { content: [{ type: 'text', text: 'No Solana wallet is bound to this account yet. Bind one from the MCPBuddy dashboard first.' }] };
    const liveAssets = hyloAssets.flatMap(asset => asset.status === 'live' && asset.mint ? [{ symbol: asset.symbol, name: asset.name, category: asset.category, tags: ['hylo'], mint: asset.mint, decimals: 0, coingeckoId: '' }] : []);
    try {
      const assets = await getMainSolanaAssetBalances(wallet.address, env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com', liveAssets);
      const hyloMintSet = new Set(liveAssets.map(asset => asset.mint));
      const hyloBalances = assets.filter(asset => asset.mint && hyloMintSet.has(asset.mint));
      return { content: [{ type: 'text', text: JSON.stringify({ walletAddress: wallet.address, assets: hyloBalances }) }], structuredContent: { walletAddress: wallet.address, assets: hyloBalances } };
    } catch (error) {
      return { content: [{ type: 'text', text: `Could not retrieve Hylo asset balances: ${error instanceof Error ? error.message : 'Unknown error.'}` }], isError: true };
    }
  });

  server.registerTool('create_hylo_buy_asset', {
    title: 'Buy Hylo asset',
    description: 'Create a Jupiter-routed unsigned transaction that swaps a supplied Solana mint into a live Hylo asset. It never signs or broadcasts.',
    inputSchema: { assetSymbol: z.string().min(1).max(20), inputMint: mintSchema.default(WSOL_MINT), inputAmountAtomic: atomicAmountSchema, slippageBps: z.number().int().min(1).max(1000).default(50) },
    outputSchema: context.reviewOutputSchema,
    _meta: { 'openai/outputTemplate': context.reviewUiUri, 'ui/resourceUri': context.reviewUiUri },
  }, async ({ assetSymbol, inputMint, inputAmountAtomic, slippageBps }: { assetSymbol: string; inputMint: string; inputAmountAtomic: string; slippageBps: number }, extra: any) => {
    try {
      const user = await context.currentUser(extra.authInfo?.extra?.githubId);
      const asset = liveHyloAsset(assetSymbol);
      if (inputMint === asset.mint) throw new Error('Choose a non-Hylo input mint that differs from the target asset.');
      const result = await createSwapByMintForUser(user.id, { inputMint, outputMint: asset.mint, amount: inputAmountAtomic, slippageBps });
      const url = reviewUrl(context, result.transactionId);
      return { content: [{ type: 'text', text: `Unsigned Hylo buy transaction created: ${result.summary.inputAmount} ${result.summary.inputToken} → ${asset.symbol}. Open ${url} to review and sign.` }], structuredContent: { ...result, reviewUrl: url, signingRequired: true }, _meta: { 'openai/outputTemplate': context.reviewUiUri } };
    } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not create Hylo buy transaction.' }], isError: true }; }
  });

  server.registerTool('create_hylo_sell_asset', {
    title: 'Sell Hylo asset',
    description: 'Create a Jupiter-routed unsigned transaction that swaps a live Hylo asset into a supplied Solana mint. It never signs or broadcasts.',
    inputSchema: { assetSymbol: z.string().min(1).max(20), outputMint: mintSchema.default(WSOL_MINT), assetAmountAtomic: atomicAmountSchema, slippageBps: z.number().int().min(1).max(1000).default(50) },
    outputSchema: context.reviewOutputSchema,
    _meta: { 'openai/outputTemplate': context.reviewUiUri, 'ui/resourceUri': context.reviewUiUri },
  }, async ({ assetSymbol, outputMint, assetAmountAtomic, slippageBps }: { assetSymbol: string; outputMint: string; assetAmountAtomic: string; slippageBps: number }, extra: any) => {
    try {
      const user = await context.currentUser(extra.authInfo?.extra?.githubId);
      const asset = liveHyloAsset(assetSymbol);
      if (outputMint === asset.mint) throw new Error('Choose an output mint that differs from the Hylo asset being sold.');
      const result = await createSwapByMintForUser(user.id, { inputMint: asset.mint, outputMint, amount: assetAmountAtomic, slippageBps });
      const url = reviewUrl(context, result.transactionId);
      return { content: [{ type: 'text', text: `Unsigned Hylo sell transaction created: ${asset.symbol} → ${result.summary.outputToken}. Open ${url} to review and sign.` }], structuredContent: { ...result, reviewUrl: url, signingRequired: true }, _meta: { 'openai/outputTemplate': context.reviewUiUri } };
    } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not create Hylo sell transaction.' }], isError: true }; }
  });

  server.registerTool('get_hylo_operation_guide', {
    title: 'Get Hylo operation guide',
    description: 'Explain which Hylo MCP tool to call for one operation. Keep this as the single guide-style Hylo tool.',
    inputSchema: { operation: operationSchema },
    outputSchema: {
      operation: z.string(),
      title: z.string(),
      summary: z.string(),
      appUrl: z.string().url(),
      docsUrl: z.string().url(),
      safety: z.string(),
    },
  }, async ({ operation }: { operation: keyof typeof hyloOperations }) => {
    const guide = hyloOperations[operation];
    const result = { operation, ...guide, safety: 'Buy/sell tools create unsigned Jupiter swap transactions for wallet review. Native Hylo mint/earn/leverage builders are not enabled until backed by a verified Hylo SDK/API integration.' };
    return { content: [{ type: 'text', text: `${guide.title}: ${guide.summary}` }], structuredContent: result };
  });
}
