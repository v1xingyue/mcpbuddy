import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { verifyToken } from '@/lib/oauth';
import { publicOrigin } from '@/lib/config';
import { getDb } from '@/lib/db';
import { platformConnections, publishedPages, users, walletBindings } from '@/lib/db/schema';
import { put } from '@vercel/blob';
import { env } from '@/lib/config';

const publish = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/), title: z.string().min(1).max(140), content: z.string().min(1).max(100_000) });
const hello = z.object({ platform: z.enum(['grok', 'openai', 'claude']) });
const tools = [{ name: 'hello', description: 'Confirm this AI client is authenticated and connected to your MCPBuddy center. Call with your platform: grok, openai, or claude.', inputSchema: { type: 'object', properties: { platform: { type: 'string', enum: ['grok', 'openai', 'claude'] } }, required: ['platform'] } }, { name: 'get_wallet_address', description: 'Return the verified Solana wallet address bound to the current MCPBuddy account.', inputSchema: { type: 'object', properties: {} } }, { name: 'publish_page', description: 'Publish a private, account-owned page to your MCPBuddy space.', inputSchema: { type: 'object', properties: { slug: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' } }, required: ['slug', 'title', 'content'] } }, { name: 'list_pages', description: 'List pages previously published by this MCP identity.', inputSchema: { type: 'object', properties: {} } }];

async function identity(request: Request) {
  const raw = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!raw) return null; return verifyToken(raw, publicOrigin(request), 'access_token');
}
function unauthorized(request: Request) { const origin = publicOrigin(request); return Response.json({ error: 'invalid_token' }, { status: 401, headers: { 'WWW-Authenticate': `Bearer error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"` } }); }

export async function GET(request: Request) { return (await identity(request)) ? Response.json({ name: 'MCPBuddy', transport: 'streamable-http', tools }) : unauthorized(request); }
export async function POST(request: Request) {
  const token = await identity(request).catch(() => null); if (!token) return unauthorized(request);
  const body = await request.json().catch(() => null);
  if (body?.method === 'initialize') {
    const version = typeof body.params?.protocolVersion === 'string' ? body.params.protocolVersion : '2025-03-26';
    return Response.json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: version, capabilities: { tools: {} }, serverInfo: { name: 'MCPBuddy', version: '0.1.0' }, instructions: 'Use hello to verify the connection, get_wallet_address for the verified Solana wallet, and publish_page to create account-owned content.' } }, { headers: { 'MCP-Protocol-Version': version } });
  }
  // MCP notifications have no JSON-RPC id and deliberately receive no body.
  if (body?.method === 'notifications/initialized') return new Response(null, { status: 202 });
  if (body?.method === 'tools/list') return Response.json({ jsonrpc: '2.0', id: body.id, result: { tools } }, { headers: { 'MCP-Protocol-Version': '2025-03-26' } });
  if (body?.method !== 'tools/call') return Response.json({ jsonrpc: '2.0', id: body?.id, error: { code: -32601, message: 'Method not found' } });
  try {
    const db = getDb(); const [user] = await db.select().from(users).where(eq(users.githubId, token.sub)).limit(1);
    if (!user) throw new Error('Your account has not been provisioned. Sign in to MCPBuddy once before connecting.');
    if (body.params?.name === 'hello') {
      const value = hello.parse(body.params.arguments);
      await db.insert(platformConnections).values({ userId: user.id, platform: value.platform, clientId: token.client_id }).onConflictDoUpdate({ target: [platformConnections.userId, platformConnections.platform], set: { clientId: token.client_id, confirmedAt: new Date() } });
      return Response.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: `Hello received from ${value.platform}. MCPBuddy has confirmed this connection for ${user.name ?? 'your account'}.` }] } });
    }
    if (body.params?.name === 'get_wallet_address') {
      const [wallet] = await db.select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1);
      return Response.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: wallet ? wallet.address : 'No Solana wallet is bound to this account yet. Bind one from the MCPBuddy dashboard first.' }] } });
    }
    if (body.params?.name === 'publish_page') {
      const value = publish.parse(body.params.arguments);
      const blob = env.BLOB_READ_WRITE_TOKEN ? await put(`pages/${user.id}/${value.slug}.md`, value.content, { access: 'public', addRandomSuffix: false, contentType: 'text/markdown; charset=utf-8', token: env.BLOB_READ_WRITE_TOKEN }) : null;
      await db.insert(publishedPages).values({ userId: user.id, ...value, blobUrl: blob?.url });
      return Response.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: `Published ${value.slug}${blob ? ` to ${blob.url}` : ''}` }] } });
    }
    if (body.params?.name === 'list_pages') { const pages = await db.select({ slug: publishedPages.slug, title: publishedPages.title, updatedAt: publishedPages.updatedAt }).from(publishedPages).where(eq(publishedPages.userId, user.id)); return Response.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify(pages) }] } }); }
    throw new Error('Unknown tool.');
  } catch (error) { return Response.json({ jsonrpc: '2.0', id: body?.id, error: { code: -32000, message: error instanceof Error ? error.message : 'Tool failed' } }); }
}
