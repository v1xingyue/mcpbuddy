import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { verifyMcpToken } from '@/lib/mcp-auth';
import { getDb } from '@/lib/db';
import { authIdentities, platformConnections, publishedPages, users, walletBindings } from '@/lib/db/schema';
import { env } from '@/lib/config';
import { getMainSolanaAssetBalances } from '@/lib/solana-assets';
import { solanaSwapTokens } from '@/lib/solana-assets';
import { contextPackForMcp } from '@/lib/context-pack';
import { createSwapForUser } from '@/lib/solana-swap';

async function currentUser(accountId: unknown) {
  if (typeof accountId !== 'string') throw new Error('Missing authenticated account identity.');
  const separator = accountId.indexOf(':');
  const provider = separator > 0 ? accountId.slice(0, separator) : 'github';
  const providerAccountId = separator > 0 ? accountId.slice(separator + 1) : accountId;
  const db = getDb();
  if (provider === 'wallet') {
    const [binding] = await db.select().from(walletBindings).where(eq(walletBindings.address, providerAccountId)).limit(1);
    if (binding) {
      await db.insert(authIdentities).values({ userId: binding.userId, provider, providerAccountId })
        .onConflictDoUpdate({ target: [authIdentities.provider, authIdentities.providerAccountId], set: { userId: binding.userId } });
      const [boundUser] = await db.select().from(users).where(eq(users.id, binding.userId)).limit(1);
      if (boundUser) return boundUser;
    }
  }
  const [identity] = await db.select().from(authIdentities).where(and(eq(authIdentities.provider, provider), eq(authIdentities.providerAccountId, providerAccountId))).limit(1);
  const [user] = identity
    ? await db.select().from(users).where(eq(users.id, identity.userId)).limit(1)
    : provider === 'github' ? await db.select().from(users).where(eq(users.githubId, providerAccountId)).limit(1) : [];
  if (!user) throw new Error('Your account has not been provisioned. Sign in to MCPBuddy once before connecting.');
  return user;
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'hello',
      'Confirm this AI client is authenticated and connected to your MCPBuddy center.',
      { platform: z.enum(['grok', 'openai', 'claude']) },
      async ({ platform }, extra) => {
        const user = await currentUser(extra.authInfo?.extra?.githubId);
        await getDb().insert(platformConnections).values({ userId: user.id, platform, clientId: extra.authInfo?.clientId ?? 'unknown' })
          .onConflictDoUpdate({ target: [platformConnections.userId, platformConnections.platform], set: { clientId: extra.authInfo?.clientId ?? 'unknown', confirmedAt: new Date() } });
        return { content: [{ type: 'text', text: `Hello received from ${platform}. MCPBuddy has confirmed this connection for ${user.name ?? 'your account'}.` }] };
      },
    );
    server.tool(
      'get_wallet_address',
      'Return the verified Solana wallet address bound to the current MCPBuddy account.',
      {},
      async (_args, extra) => {
        const user = await currentUser(extra.authInfo?.extra?.githubId);
        const [wallet] = await getDb().select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1);
        return { content: [{ type: 'text', text: wallet?.address ?? 'No Solana wallet is bound to this account yet. Bind one from the MCPBuddy dashboard first.' }] };
      },
    );
    server.tool(
      'get_solana_asset_balances',
      'Return balances, current USD prices, and USD valuations for the configured famous Solana-token list in the wallet bound to the current account. Read-only; it cannot sign or submit transactions.',
      {},
      async (_args, extra) => {
        const user = await currentUser(extra.authInfo?.extra?.githubId);
        const [wallet] = await getDb().select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1);
        if (!wallet) return { content: [{ type: 'text', text: 'No Solana wallet is bound to this account yet. Bind one from the MCPBuddy dashboard first.' }] };
        try {
          const assets = await getMainSolanaAssetBalances(wallet.address, env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com');
          return { content: [{ type: 'text', text: JSON.stringify({ walletAddress: wallet.address, quoteCurrency: 'USD', assets }) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error.';
          return { content: [{ type: 'text', text: `Could not retrieve Solana asset balances: ${message}` }], isError: true };
        }
      },
    );
    server.tool(
      'list_solana_swap_tokens',
      'List the allowlisted Solana assets available to create_solana_swap. Call this before creating a swap; use each asset’s symbol, not its mint address.',
      {},
      async () => ({ content: [{ type: 'text', text: JSON.stringify({ cluster: 'mainnet-beta', tokens: solanaSwapTokens.map(({ symbol, name, mint, decimals }) => ({ symbol, name, mint, decimals })) }) }] }),
    );
    server.tool(
      'create_solana_swap',
      'Create a Jupiter-routed Solana swap as an unsigned, short-lived transaction for the bound wallet. Call list_solana_swap_tokens first. It never receives a private key and never broadcasts. The user must review and sign it in MCPBuddy.',
      {
        inputToken: z.string().min(1).max(20).describe('Input token symbol returned by list_solana_swap_tokens, for example SOL or USDC.'),
        outputToken: z.string().min(1).max(20).describe('Output token symbol returned by list_solana_swap_tokens.'),
        amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Positive human-readable token amount, for example "0.1" SOL or "25" USDC.'),
        slippageBps: z.number().int().min(1).max(1000).default(50).describe('Maximum slippage in basis points; 50 = 0.5%.'),
      },
      async (args, extra) => {
        try {
          const user = await currentUser(extra.authInfo?.extra?.githubId);
          const result = await createSwapForUser(user.id, args);
          return { content: [{ type: 'text', text: JSON.stringify({ ...result, signingRequired: true, nextStep: 'Open MCPBuddy Account → Pending swaps, inspect the immutable signing summary, then sign with the bound wallet.' }) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not create swap transaction.' }], isError: true };
        }
      },
    );
    server.tool(
      'user_info',
      'Read the current user’s private AI Context Pack before starting work. It contains their profile, working preferences, hard limits, current goals, project notes, and tool guidance.',
      {},
      async (_args, extra) => {
        const user = await currentUser(extra.authInfo?.extra?.githubId);
        return { content: [{ type: 'text', text: contextPackForMcp(user.userInfo) }] };
      },
    );
    server.tool(
      'publish_page',
      'Publish an account-owned Markdown page and return its storage URL.',
      { slug: z.string().regex(/^[a-z0-9-]{1,80}$/), title: z.string().min(1).max(140), content: z.string().min(1).max(100_000), public: z.boolean().default(false).describe('Whether anyone with the returned URL can view the page.') },
      async ({ slug, title, content, public: isPublic }, extra) => {
        const user = await currentUser(extra.authInfo?.extra?.githubId);
        // Private pages stay solely in Postgres; never write their content to a public Blob URL.
        const blob = isPublic && env.BLOB_READ_WRITE_TOKEN ? await put(`pages/${user.id}/${slug}.md`, content, { access: 'public', addRandomSuffix: false, contentType: 'text/markdown; charset=utf-8', token: env.BLOB_READ_WRITE_TOKEN }) : null;
        const publicId = isPublic ? randomUUID() : null;
        const [page] = await getDb().insert(publishedPages).values({ userId: user.id, slug, title, content, blobUrl: blob?.url, isPublic, publicId }).returning({ id: publishedPages.id, publicId: publishedPages.publicId });
        const origin = env.MCP_RESOURCE_URL ?? env.NEXT_PUBLIC_APP_URL ?? 'https://mcpbuddy.creatorsand.fun';
        const pageUrl = isPublic ? `${origin}/p/${page.publicId}` : `${origin}/pages/${page.id}`;
        return { content: [{ type: 'text', text: isPublic ? `Published public page: ${pageUrl}` : `Published private page. Open it from your MCPBuddy dashboard: ${pageUrl}` }] };
      },
    );
    server.tool(
      'list_pages',
      'List pages previously published by this MCP identity.',
      {},
      async (_args, extra) => {
        const user = await currentUser(extra.authInfo?.extra?.githubId);
        const pages = await getDb().select({ id: publishedPages.id, slug: publishedPages.slug, title: publishedPages.title, isPublic: publishedPages.isPublic, publicId: publishedPages.publicId, updatedAt: publishedPages.updatedAt }).from(publishedPages).where(eq(publishedPages.userId, user.id));
        return { content: [{ type: 'text', text: JSON.stringify(pages) }] };
      },
    );
    server.tool(
      'get_page_content',
      'Read the full Markdown content of one of the current account’s published pages. Supply exactly one of id or title. Titles must match exactly; use list_pages first to obtain an id when titles are duplicated.',
      {
        id: z.string().uuid().optional().describe('The page UUID returned by list_pages.'),
        title: z.string().min(1).max(140).optional().describe('The exact page title. Use id instead if more than one page has this title.'),
      },
      async ({ id, title }, extra) => {
        const user = await currentUser(extra.authInfo?.extra?.githubId);
        if ((id ? 1 : 0) + (title ? 1 : 0) !== 1) {
          return { content: [{ type: 'text', text: 'Provide exactly one of id or title.' }], isError: true };
        }

        const pages = await getDb()
          .select({ id: publishedPages.id, slug: publishedPages.slug, title: publishedPages.title, content: publishedPages.content, isPublic: publishedPages.isPublic, updatedAt: publishedPages.updatedAt })
          .from(publishedPages)
          .where(and(eq(publishedPages.userId, user.id), id ? eq(publishedPages.id, id) : eq(publishedPages.title, title!)))
          .limit(2);

        if (pages.length === 0) {
          return { content: [{ type: 'text', text: `No page found with the supplied ${id ? 'id' : 'title'}.` }], isError: true };
        }
        if (pages.length > 1) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'More than one page has this title. Call get_page_content with an id instead.', matches: pages.map(({ id: pageId, slug, title: pageTitle }) => ({ id: pageId, slug, title: pageTitle })) }) }], isError: true };
        }

        return { content: [{ type: 'text', text: JSON.stringify(pages[0]) }] };
      },
    );
  },
  { serverInfo: { name: 'MCPBuddy', version: '0.2.0' } },
  { basePath: '/api', maxDuration: 60, disableSse: true },
);

const authenticatedHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  requiredScopes: ['mcp:tools'],
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
});

export { authenticatedHandler as GET, authenticatedHandler as POST, authenticatedHandler as DELETE };
