import { z } from 'zod';
import type { McpToolServer } from '@/lib/mcp/plugins/types';
import { HYLO_APP_URL, HYLO_DEVELOPER_TELEGRAM_URL, HYLO_DOCS_URL, HYLO_SDK_URL, hyloAssets, hyloOperations, hyloPrograms } from '@/lib/hylo';

const assetCategorySchema = z.enum(['stablecoin', 'earn', 'lst', 'xasset', 'collateral']).optional();
const operationSchema = z.enum(['mint_hyusd', 'earn_ehyusd', 'mint_xasset', 'liquid_staking']);

/** Hylo protocol discovery tools. These tools never construct, sign, or submit transactions. */
export function registerHyloCorePlugin(server: McpToolServer) {
  server.registerTool('list_hylo_assets', {
    title: 'List Hylo assets',
    description: 'List Hylo protocol assets, token mints, status, app links, and documentation links. Read-only.',
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

  server.registerTool('get_hylo_onchain_addresses', {
    title: 'Get Hylo onchain addresses',
    description: 'Return official Hylo Solana mainnet program addresses and token mints from the Hylo docs. Read-only.',
    inputSchema: {},
    outputSchema: {
      programs: z.array(z.object({ name: z.string(), version: z.string(), address: z.string(), solscanUrl: z.string().url() })),
      tokenMints: z.array(z.object({ symbol: z.string(), name: z.string(), category: z.string(), status: z.string(), mint: z.string(), solscanUrl: z.string().url() })),
      source: z.string().url(),
    },
  }, async () => {
    const tokenMints = hyloAssets.flatMap(asset => asset.mint ? [{ symbol: asset.symbol, name: asset.name, category: asset.category, status: asset.status, mint: asset.mint, solscanUrl: `https://solscan.io/account/${asset.mint}` }] : []);
    const result = { programs: hyloPrograms, tokenMints, source: `${HYLO_DOCS_URL}/security/onchain-addresses` };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });

  server.registerTool('get_hylo_operation_guide', {
    title: 'Get Hylo operation guide',
    description: 'Explain where to perform a Hylo operation and which docs describe it. This returns guidance only and does not create a transaction.',
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
    const result = { operation, ...guide, safety: 'MCPBuddy currently exposes Hylo as read-only protocol guidance. Use the Hylo app with your own wallet for any signing or submission.' };
    return { content: [{ type: 'text', text: `${guide.title}: ${guide.summary} Open ${guide.appUrl}. Docs: ${guide.docsUrl}. MCPBuddy does not sign or submit Hylo transactions.` }], structuredContent: result };
  });

  server.registerTool('get_hylo_developer_resources', {
    title: 'Get Hylo developer resources',
    description: 'Return Hylo SDK and developer support links. Read-only.',
    inputSchema: {},
    outputSchema: {
      docsUrl: z.string().url(),
      sdkUrl: z.string().url(),
      developerTelegramUrl: z.string().url(),
      crates: z.array(z.object({ name: z.string(), purpose: z.string() })),
      apiStatus: z.string(),
    },
  }, async () => {
    const result = {
      docsUrl: HYLO_DOCS_URL,
      sdkUrl: HYLO_SDK_URL,
      developerTelegramUrl: HYLO_DEVELOPER_TELEGRAM_URL,
      apiStatus: 'Hylo documentation says public APIs are coming soon; current developer integration is through the Rust SDK.',
      crates: [
        { name: 'hylo-core', purpose: 'Protocol math, fee curves, conversions, rebalance zones' },
        { name: 'hylo-idl', purpose: 'Anchor IDL codegen, PDA derivations, token definitions' },
        { name: 'hylo-clients', purpose: 'Transaction builders and execution clients' },
        { name: 'hylo-quotes', purpose: 'Quoting strategies from cached state or simulation' },
        { name: 'hylo-jupiter', purpose: 'Jupiter AMM trait implementation' },
        { name: 'hylo-stats', purpose: 'Offchain yield statistics and Earn Pool APY math' },
      ],
    };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
}
