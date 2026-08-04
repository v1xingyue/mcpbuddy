import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { verifyMcpToken } from '@/lib/mcp-auth';
import { getDb } from '@/lib/db';
import { authIdentities, platformConnections, publishedPages, users, walletBindings, walletTokenWatchlist } from '@/lib/db/schema';
import { env } from '@/lib/config';
import { contextPackForMcp } from '@/lib/context-pack';
import { publicHtmlBlobPath, publicHtmlSchema } from '@/lib/public-html';
import { registerSolanaBasePlugin } from '@/lib/mcp/plugins/solana/base';
import { registerSolanaJupiterPlugin } from '@/lib/mcp/plugins/solana/jupiter';
import { registerHyloCorePlugin } from '@/lib/mcp/plugins/hylo/core';

// MCP Apps clients resolve this resource into a sandboxed, interactive card. Clients
// that do not implement MCP Apps still receive the text content returned by the tool.
const SWAP_REVIEW_UI_URI = 'ui://mcpbuddy/swap-review.html';
// MCP Apps clients use a tool's advertised output schema to decide whether to
// expose CallToolResult.structuredContent to the resource bridge. Keep this
// deliberately permissive for immutable transaction summaries, whose fields
// vary slightly between Jupiter swaps and SPL-token transfers.
const transactionReviewOutputSchema = {
  transactionId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  reviewUrl: z.string().url(),
  signingRequired: z.literal(true),
  summary: z.object({
    kind: z.enum(['swap', 'transfer']),
    inputToken: z.string(),
    outputToken: z.string(),
    inputAmount: z.string(),
    inputAmountAtomic: z.string(),
    expectedOutputAtomic: z.string(),
    minimumOutputAtomic: z.string(),
    slippageBps: z.number(),
    priceImpactPct: z.string().nullable(),
    route: z.array(z.string()),
  }).passthrough(),
};
const transactionStatusOutputSchema = {
  transactionId: z.string().uuid(),
  status: z.string(),
  signature: z.string().nullable(),
  error: z.string().nullable(),
  expiresAt: z.string().datetime(),
  submittedAt: z.string().datetime().nullable(),
};
const SWAP_REVIEW_UI = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; padding: 16px; color: #172033; background: transparent; }
  .card { border: 1px solid #d6dcea; border-radius: 14px; padding: 16px; background: #fff; box-shadow: 0 4px 18px #17203312; }
  .label { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; color: #56627a; }
  h2 { margin: 0; font-size: 20px; } .amount { margin: 8px 0 16px; font-size: 16px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; margin: 0 0 16px; font-size: 13px; }
  dt { color: #667085; } dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  .notice { padding: 10px; border-radius: 8px; background: #fff8e6; color: #6b4e00; font-size: 13px; line-height: 1.4; }
  button { width: 100%; border: 0; border-radius: 9px; padding: 11px 14px; margin-top: 14px; background: #155eef; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  button:hover { background: #004eea; } button:disabled { background: #94a3b8; cursor: wait; } @media (prefers-color-scheme: dark) { body { color: #eef2ff; } .card { background: #192235; border-color: #34415b; } .label { color: #aebbd3; } dt { color: #b7c2d9; } dd { color: #f4f7ff; } .notice { background: #41350e; color: #ffde83; } }
</style></head><body><main class="card" aria-live="polite"><p class="label">UNSIGNED SWAP · REVIEW REQUIRED</p><h2 id="pair">Preparing transaction…</h2><p class="amount" id="amount"></p><dl id="details"></dl><div class="notice">This card cannot sign or submit a transaction. Review the immutable summary and sign only in MCPBuddy with your connected wallet.</div><p class="notice" id="status" hidden></p><button id="review" type="button">Open secure review & sign</button></main>
<script>
  const pair = document.querySelector('#pair'); const amount = document.querySelector('#amount'); const details = document.querySelector('#details'); const review = document.querySelector('#review'); const status = document.querySelector('#status'); let currentData = {}; let pollTimer;
  function asObject(value) {
    if (typeof value === 'string') { try { return JSON.parse(value); } catch { return {}; } }
    return value && typeof value === 'object' ? value : {};
  }
  function outputData() {
    const candidates = [window.openai?.structuredContent, window.openai?.toolOutput];
    for (const candidate of candidates) {
      const output = asObject(candidate);
      if (output.transactionId) return output;
      const nested = asObject(output.structuredContent);
      if (nested.transactionId) return nested;
      const result = asObject(output.result);
      if (result.transactionId) return result;
    }
    // ChatGPT may re-mount an App card after the transient tool result has
    // been discarded. widgetState belongs to this card instance and survives
    // that re-mount, unlike a page-global browser cache.
    const saved = asObject(window.openai?.widgetState);
    const transaction = asObject(saved.transaction);
    if (transaction.transactionId) return transaction;
    return {};
  }
  function saveOutput(data) {
    if (!data.transactionId || !window.openai?.setWidgetState) return;
    const existing = asObject(asObject(window.openai?.widgetState).transaction);
    if (existing.transactionId === data.transactionId) return;
    // Keep only the display-safe result. Transaction bytes, signatures and any
    // reusable authorization material must never cross into the card state.
    const transaction = { transactionId: data.transactionId, expiresAt: data.expiresAt, reviewUrl: data.reviewUrl, signingRequired: data.signingRequired, summary: data.summary };
    try { window.openai.setWidgetState({ transaction }); } catch { /* State persistence is an optional bridge capability. */ }
  }
  function render() {
    currentData = outputData(); const summary = currentData.summary || {}; const ready = Boolean(currentData.transactionId);
    if (ready) saveOutput(currentData);
    pair.textContent = ready ? summary.inputToken + ' → ' + summary.outputToken : 'Transaction details unavailable';
    amount.textContent = ready ? 'Sell ' + summary.inputAmount + ' ' + summary.inputToken : 'The MCP client did not pass the tool structured data to this card. Use the review link in the tool response.';
    const fields = ready ? [['Expected / minimum', summary.expectedOutput ? summary.expectedOutput + ' / ' + summary.minimumOutput + ' ' + summary.outputToken : summary.expectedOutputAtomic + ' / ' + summary.minimumOutputAtomic + ' atomic'], ['Maximum slippage', (summary.slippageBps / 100) + '%'], ['Price impact', summary.priceImpactPct != null ? summary.priceImpactPct + '%' : '—'], ['Route', (summary.route || []).join(' → ') || '—'], ['Expires', new Date(currentData.expiresAt).toLocaleTimeString()], ['Transaction ID', currentData.transactionId]] : [];
    details.replaceChildren(); fields.forEach(([key, value]) => { const term = document.createElement('dt'); const definition = document.createElement('dd'); term.textContent = key; definition.textContent = value; details.append(term, definition); });
    review.disabled = !ready; review.textContent = ready ? 'Open secure review & sign' : 'Transaction result is unavailable';
  }
  async function pollStatus() {
    if (!currentData.transactionId || !window.openai?.callTool) return;
    try { const result = await window.openai.callTool('get_solana_transaction_status', { transactionId: currentData.transactionId }); const data = result?.structuredContent || result; if (!data?.status) return; status.hidden = false; status.textContent = data.status === 'submitted' ? 'Submitted on Solana: ' + data.signature : data.status === 'awaiting_signature' ? 'Waiting for wallet signature…' : 'Transaction ' + data.status + (data.error ? ': ' + data.error : ''); if (data.status !== 'awaiting_signature') clearInterval(pollTimer); } catch { /* bridge polling is optional; the account page remains authoritative. */ }
  }
  review.addEventListener('click', () => { if (currentData.reviewUrl) { window.open(currentData.reviewUrl, '_blank', 'noopener'); pollStatus(); pollTimer = setInterval(pollStatus, 4000); } });
  // The Apps bridge changes globals after a tool call completes; re-render then.
  window.addEventListener('openai:set_globals', render); render();
</script></body></html>`;

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
    const solanaPluginContext = { currentUser, reviewUiUri: SWAP_REVIEW_UI_URI, reviewUi: SWAP_REVIEW_UI, reviewOutputSchema: transactionReviewOutputSchema, transactionStatusOutputSchema, appOrigin: () => env.MCP_RESOURCE_URL ?? env.NEXT_PUBLIC_APP_URL ?? 'https://mcpbuddy.creatorsand.fun' };
    registerSolanaBasePlugin(server, solanaPluginContext);
    registerSolanaJupiterPlugin(server, solanaPluginContext);
    registerHyloCorePlugin(server, solanaPluginContext);
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
    server.registerTool(
      'publish_html',
      {
        title: 'Publish HTML',
        description: 'Publish one complete HTML document to an isolated public URL. The returned link is publicly accessible: do not include secrets, private account data, or reusable credentials.',
        inputSchema: { html: publicHtmlSchema.describe('A complete standalone HTML document, including <html> and </html>. Maximum 1 MB.') },
        outputSchema: { url: z.string().url() },
      },
      async ({ html }, extra) => {
        try {
          const user = await currentUser(extra.authInfo?.extra?.githubId);
          if (!env.BLOB_READ_WRITE_TOKEN) {
            return { content: [{ type: 'text', text: 'Public HTML publishing is not configured. Set BLOB_READ_WRITE_TOKEN before using publish_html.' }], isError: true };
          }
          const blob = await put(publicHtmlBlobPath(user.id, randomUUID()), html, {
            access: 'public',
            addRandomSuffix: false,
            contentType: 'text/html; charset=utf-8',
            token: env.BLOB_READ_WRITE_TOKEN,
          });
          return {
            content: [{ type: 'text', text: `Published public HTML: ${blob.url}` }],
            structuredContent: { url: blob.url },
          };
        } catch {
          // Provider errors can contain implementation details; never surface them to an MCP client.
          return { content: [{ type: 'text', text: 'Could not publish the HTML document. Please try again.' }], isError: true };
        }
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
