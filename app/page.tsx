import { auth, signIn, signOut } from '@/auth';
import { provisionUser } from './actions';
import { WalletButton } from '@/components/wallet-button';
import { PlatformConnections } from '@/components/platform-connections';
import { DashboardTools } from '@/components/dashboard-tools';
import { PageList } from '@/components/page-list';
import { getDb } from '@/lib/db';
import { publishedPages, walletBindings } from '@/lib/db/schema';
import { platformConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function Copy({ children }: { children: React.ReactNode }) { return <code className="endpoint">{children}</code>; }
export default async function Home() {
  const session = await auth(); let wallet: string | undefined; let connectedPlatforms: string[] = []; let pages: Array<{ id: string; title: string; slug: string; isPublic: boolean; publicId: string | null }> = [];
  if (session?.user?.id) { const user = await provisionUser().catch(() => null); if (user) { wallet = (await getDb().select().from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1))[0]?.address; connectedPlatforms = (await getDb().select({ platform: platformConnections.platform }).from(platformConnections).where(eq(platformConnections.userId, user.id))).map(connection => connection.platform); pages = await getDb().select({ id: publishedPages.id, title: publishedPages.title, slug: publishedPages.slug, isPublic: publishedPages.isPublic, publicId: publishedPages.publicId }).from(publishedPages).where(eq(publishedPages.userId, user.id)); } }
  return <main>
    <nav><a className="brand" href="/">mcp<span>buddy</span></a><div>{session?.user ? <form action={async () => { 'use server'; await signOut(); }}><button className="quiet">Sign out</button></form> : <form action={async () => { 'use server'; await signIn('github'); }}><button>Continue with GitHub</button></form>}</div></nav>
    {!session?.user ? <section className="hero"><p className="eyebrow">PRIVATE MCP INFRASTRUCTURE</p><h1>One connection center.<br/><i>Every AI client.</i></h1><p className="lead">Give Claude, ChatGPT, and Grok a secure, account-scoped way to reach your tools—without copying API keys between platforms.</p><form action={async () => { 'use server'; await signIn('github'); }}><button className="primary">Build your MCP center <span>→</span></button></form><div className="platforms"><b>Works with</b><span>Claude</span><span>OpenAI</span><span>Grok</span></div></section> : <section className="dashboard"><div className="welcome"><div><p className="eyebrow">YOUR CONNECTION CENTER</p><h1>Welcome back, {session.user.name?.split(' ')[0] ?? 'builder'}.</h1><p className="lead">Your private endpoint is ready for the AI clients you trust.</p></div><WalletButton address={wallet}/></div><div className="endpoint-card"><div><p className="label">MCP endpoint</p><Copy>{process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'}/api/mcp</Copy></div><span className="live">● live</span></div><PlatformConnections connectedPlatforms={connectedPlatforms} /><DashboardTools /><PageList pages={pages} /></section>}
    <footer><span>Built for the open agent web.</span><span>Vercel Postgres · Private Blob · Solana</span></footer>
  </main>;
}
