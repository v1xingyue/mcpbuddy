import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { verifyMcpToken } from '@/lib/mcp-auth';
import { getDb } from '@/lib/db';
import { platformConnections, publishedPages, users, walletBindings } from '@/lib/db/schema';
import { env } from '@/lib/config';

async function currentUser(githubId: unknown) {
  if (typeof githubId !== 'string') throw new Error('Missing authenticated account identity.');
  const [user] = await getDb().select().from(users).where(eq(users.githubId, githubId)).limit(1);
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
      'publish_page',
      'Publish an account-owned Markdown page and return its storage URL.',
      { slug: z.string().regex(/^[a-z0-9-]{1,80}$/), title: z.string().min(1).max(140), content: z.string().min(1).max(100_000) },
      async ({ slug, title, content }, extra) => {
        const user = await currentUser(extra.authInfo?.extra?.githubId);
        const blob = env.BLOB_READ_WRITE_TOKEN ? await put(`pages/${user.id}/${slug}.md`, content, { access: 'public', addRandomSuffix: false, contentType: 'text/markdown; charset=utf-8', token: env.BLOB_READ_WRITE_TOKEN }) : null;
        await getDb().insert(publishedPages).values({ userId: user.id, slug, title, content, blobUrl: blob?.url });
        return { content: [{ type: 'text', text: `Published ${slug}${blob ? ` to ${blob.url}` : ''}` }] };
      },
    );
    server.tool(
      'list_pages',
      'List pages previously published by this MCP identity.',
      {},
      async (_args, extra) => {
        const user = await currentUser(extra.authInfo?.extra?.githubId);
        const pages = await getDb().select({ slug: publishedPages.slug, title: publishedPages.title, updatedAt: publishedPages.updatedAt }).from(publishedPages).where(eq(publishedPages.userId, user.id));
        return { content: [{ type: 'text', text: JSON.stringify(pages) }] };
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
