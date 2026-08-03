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
import { createSwapForUser, createSwapByMintForUser, createTokenTransferForUser, quoteableSolanaSwapTokens, swapStatusForUser } from '@/lib/solana-swap';

// MCP Apps clients resolve this resource into a sandboxed, interactive card. Clients
// that do not implement MCP Apps still receive the text content returned by the tool.
const SWAP_REVIEW_UI_URI = 'ui://mcpbuddy/swap-review.html';
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
  button:hover { background: #004eea; } button:disabled { background: #94a3b8; cursor: wait; } @media (prefers-color-scheme: dark) { .card { background: #192235; border-color: #34415b; } .notice { background: #41350e; color: #ffde83; } }
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
    return {};
  }
  function render() {
    currentData = outputData(); const summary = currentData.summary || {}; const ready = Boolean(currentData.transactionId);
    pair.textContent = ready ? summary.inputToken + ' → ' + summary.outputToken : 'Transaction details unavailable';
    amount.textContent = ready ? 'Sell ' + summary.inputAmount + ' ' + summary.inputToken : 'The MCP client did not pass the tool structured data to this card. Use the review link in the tool response.';
    const fields = ready ? [['Expected / minimum', summary.expectedOutput ? summary.expectedOutput + ' / ' + summary.minimumOutput + ' ' + summary.outputToken : summary.expectedOutputAtomic + ' / ' + summary.minimumOutputAtomic + ' atomic'], ['Maximum slippage', (summary.slippageBps / 100) + '%'], ['Price impact', summary.priceImpactPct != null ? summary.priceImpactPct + '%' : '—'], ['Route', (summary.route || []).join(' → ') || '—'], ['Expires', new Date(currentData.expiresAt).toLocaleTimeString()], ['Transaction ID', currentData.transactionId]] : [];
    details.replaceChildren(); fields.forEach(([key, value]) => { const term = document.createElement('dt'); const definition = document.createElement('dd'); term.textContent = key; definition.textContent = value; details.append(term, definition); });
    review.disabled = !ready; review.textContent = ready ? 'Open secure review & sign' : 'Awaiting structured tool result…';
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
    server.registerResource(
      'solana-swap-review',
      SWAP_REVIEW_UI_URI,
      {
        title: 'Solana swap review',
        description: 'Interactive review card for an unsigned Solana swap.',
        mimeType: 'text/html+skybridge',
        _meta: { 'openai/widgetPrefersBorder': true, 'openai/widgetAccessible': true },
      },
      async () => ({ contents: [{ uri: SWAP_REVIEW_UI_URI, mimeType: 'text/html+skybridge', text: SWAP_REVIEW_UI }] }),
    );
    server.tool('create_solana_token_transfer', 'Create an unsigned SPL-token transfer for review and wallet signing. Call list_solana_swap_tokens first; the recipient must already have a token account for this mint.', { token: z.string().min(1).max(20), recipient: z.string().min(32).max(64), amount: z.string().regex(/^\d+(\.\d+)?$/) }, async (args, extra) => {
      try { const user = await currentUser(extra.authInfo?.extra?.githubId); const result = await createTokenTransferForUser(user.id, args); const origin = env.MCP_RESOURCE_URL ?? env.NEXT_PUBLIC_APP_URL ?? 'https://mcpbuddy.creatorsand.fun'; const reviewUrl = `${origin}/account?swap=${result.transactionId}`; return { content: [{ type: 'text', text: `Unsigned ${result.summary.inputAmount} ${result.summary.inputToken} transfer created for ${args.recipient}. Open ${reviewUrl} to review and sign.` }], structuredContent: { ...result, reviewUrl, signingRequired: true }, _meta: { 'openai/outputTemplate': SWAP_REVIEW_UI_URI } }; } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not create token transfer.' }], isError: true }; }
    });
    server.tool('get_solana_transaction_status', 'Read the status of one account-owned pending Solana transaction. Use the transactionId returned by a create_solana_swap or transfer tool.', { transactionId: z.string().uuid() }, async ({ transactionId }, extra) => {
      try { const user = await currentUser(extra.authInfo?.extra?.githubId); const result = await swapStatusForUser(user.id, transactionId); return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }; } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not read transaction status.' }], isError: true }; }
    });
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
      'List configured Solana assets currently quoteable by Jupiter from the supplied input token and amount. Call this before creating a swap; use each returned symbol, not a guessed mint address.',
      { inputToken: z.string().min(1).max(20).default('USDC').describe('Input token symbol used for live route validation; defaults to USDC.'), amount: z.string().regex(/^\d+(\.\d+)?$/).default('1').describe('Human-readable input amount used for live route validation; defaults to 1.') },
      async ({ inputToken, amount }) => {
        try { const tokens = await quoteableSolanaSwapTokens(inputToken, amount); return { content: [{ type: 'text', text: JSON.stringify({ cluster: 'mainnet-beta', validatedAt: new Date().toISOString(), inputToken, amount, tokens: tokens.map(({ symbol, name, mint, decimals }) => ({ symbol, name, mint, decimals })) }) }] }; }
        catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not validate Jupiter token routes.' }], isError: true }; }
      },
    );
    server.registerTool(
      'create_solana_swap',
      {
        title: 'Create Solana swap',
        description: 'Create a Jupiter-routed Solana swap as an unsigned transaction for the bound wallet. Call list_solana_swap_tokens first. It never receives a private key and never broadcasts. The user has five minutes to review it; MCPBuddy refreshes the short-lived chain transaction before signing when needed.',
        inputSchema: {
          inputToken: z.string().min(1).max(20).describe('Input token symbol returned by list_solana_swap_tokens, for example SOL or USDC.'),
          outputToken: z.string().min(1).max(20).describe('Output token symbol returned by list_solana_swap_tokens.'),
          amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Positive human-readable token amount, for example "0.1" SOL or "25" USDC.'),
          slippageBps: z.number().int().min(1).max(1000).default(50).describe('Maximum slippage in basis points; 50 = 0.5%.'),
        },
        // `openai/outputTemplate` is used by ChatGPT Apps; `ui/resourceUri` lets
        // other MCP Apps clients discover the same resource without parsing text.
        _meta: { 'openai/outputTemplate': SWAP_REVIEW_UI_URI, 'ui/resourceUri': SWAP_REVIEW_UI_URI },
      },
      async (args, extra) => {
        try {
          const user = await currentUser(extra.authInfo?.extra?.githubId);
          const result = await createSwapForUser(user.id, args);
          const origin = env.MCP_RESOURCE_URL ?? env.NEXT_PUBLIC_APP_URL ?? 'https://mcpbuddy.creatorsand.fun';
          const output = { ...result, reviewUrl: `${origin}/account?swap=${result.transactionId}`, signingRequired: true, nextStep: 'Open reviewUrl to inspect this immutable signing summary and trigger your wallet’s review-and-sign flow.' };
          return {
            content: [{ type: 'text', text: `Unsigned ${result.summary.inputToken} → ${result.summary.outputToken} swap created. Open ${output.reviewUrl} to review and trigger signing; it expires at ${result.expiresAt}.` }],
            structuredContent: output,
            _meta: { 'openai/outputTemplate': SWAP_REVIEW_UI_URI },
          };
        } catch (error) {
          return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not create swap transaction.' }], isError: true };
        }
      },
    );
    server.registerTool('create_solana_swap_by_mint', { title: 'Create Solana swap by mint', description: 'Create an unsigned Jupiter swap using arbitrary Solana mints. amount is an atomic integer, not a display decimal; for example 0.5 USDC is 500000.', inputSchema: { inputMint: z.string().min(32).max(64), outputMint: z.string().min(32).max(64), amount: z.string().regex(/^\d+$/).describe('Positive atomic token amount.'), slippageBps: z.number().int().min(1).max(1000).default(50) }, _meta: { 'openai/outputTemplate': SWAP_REVIEW_UI_URI, 'ui/resourceUri': SWAP_REVIEW_UI_URI } }, async (args, extra) => {
      try { const user = await currentUser(extra.authInfo?.extra?.githubId); const result = await createSwapByMintForUser(user.id, args); const origin = env.MCP_RESOURCE_URL ?? env.NEXT_PUBLIC_APP_URL ?? 'https://mcpbuddy.creatorsand.fun'; const reviewUrl = `${origin}/account?swap=${result.transactionId}`; return { content: [{ type: 'text', text: `Unsigned mint-to-mint swap created. Atomic input amount: ${args.amount}. Open ${reviewUrl} to review and sign.` }], structuredContent: { ...result, reviewUrl, signingRequired: true }, _meta: { 'openai/outputTemplate': SWAP_REVIEW_UI_URI } }; } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Could not create mint-based swap.' }], isError: true }; }
    });
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
