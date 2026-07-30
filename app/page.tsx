import { auth, signIn, signOut } from '@/auth';
import { provisionUser } from './actions';
import { WalletButton } from '@/components/wallet-button';
import { getDb } from '@/lib/db';
import { walletBindings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function Copy({ children }: { children: React.ReactNode }) { return <code className="endpoint">{children}</code>; }
export default async function Home() {
  const session = await auth(); let wallet: string | undefined;
  if (session?.user?.id) { const user = await provisionUser().catch(() => null); if (user) wallet = (await getDb().select().from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1))[0]?.address; }
  return <main>
    <nav><a className="brand" href="/">mcp<span>buddy</span></a><div>{session?.user ? <form action={async () => { 'use server'; await signOut(); }}><button className="quiet">Sign out</button></form> : <form action={async () => { 'use server'; await signIn('github'); }}><button>Continue with GitHub</button></form>}</div></nav>
    {!session?.user ? <section className="hero"><p className="eyebrow">PRIVATE MCP INFRASTRUCTURE</p><h1>One connection center.<br/><i>Every AI client.</i></h1><p className="lead">Give Claude, ChatGPT, and Grok a secure, account-scoped way to reach your tools—without copying API keys between platforms.</p><form action={async () => { 'use server'; await signIn('github'); }}><button className="primary">Build your MCP center <span>→</span></button></form><div className="platforms"><b>Works with</b><span>Claude</span><span>OpenAI</span><span>Grok</span></div></section> : <section className="dashboard"><div className="welcome"><div><p className="eyebrow">YOUR CONNECTION CENTER</p><h1>Welcome back, {session.user.name?.split(' ')[0] ?? 'builder'}.</h1><p className="lead">Your private endpoint is ready for the AI clients you trust.</p></div><WalletButton address={wallet}/></div><div className="endpoint-card"><div><p className="label">MCP endpoint</p><Copy>{process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'}/api/mcp</Copy></div><span className="live">● live</span></div><div className="grid"><article><div className="number">01</div><h2>Connect Claude</h2><p>Add your endpoint in Claude’s Custom Connectors. Sign in with GitHub when prompted.</p><a href="https://claude.ai" target="_blank">Open Claude ↗</a></article><article><div className="number">02</div><h2>Connect ChatGPT</h2><p>Use the same OAuth-protected endpoint in ChatGPT developer mode or your GPT Actions setup.</p><a href="https://chatgpt.com" target="_blank">Open ChatGPT ↗</a></article><article><div className="number">03</div><h2>Connect Grok</h2><p>Paste the endpoint in Custom Connectors. Grok discovers registration and completes PKCE automatically.</p><a href="https://grok.com" target="_blank">Open Grok ↗</a></article></div><section className="tools"><div><p className="eyebrow">AVAILABLE TOOLS</p><h2>Useful from day one.</h2></div><div><Copy>publish_page(slug, title, content)</Copy><p>Creates an account-owned published page. Content stays isolated to your GitHub identity.</p><Copy>list_pages()</Copy><p>Lists pages available to the connected client.</p></div></section></section>}
    <footer><span>Built for the open agent web.</span><span>Vercel Postgres · Private Blob · Solana</span></footer>
  </main>;
}
