import { auth, signIn } from '@/auth';
import { provisionUserForSession } from './actions';
import { EndpointCard } from '@/components/endpoint-card';
import { PlatformConnections } from '@/components/platform-connections';
import { AppShell } from '@/components/app-shell';
import { WalletLoginButton } from '@/components/wallet-login-button';
import { getDb } from '@/lib/db';
import { platformConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export default async function Home() {
  const session = await auth();
  if (!session?.user) return <main className="marketing"><nav><a className="brand" href="/">mcp<span>buddy</span></a><details className="login-menu" id="login-options"><summary>Log in</summary><div><form action={async () => { 'use server'; await signIn('github'); }}><button>Log in with GitHub</button></form><form action={async () => { 'use server'; await signIn('google'); }}><button className="google-auth">Log in with Google</button></form><WalletLoginButton /></div></details></nav><section className="hero"><p className="eyebrow">PRIVATE MCP INFRASTRUCTURE</p><h1>One connection center.<br/><i>Every AI client.</i></h1><p className="lead">Give Claude, ChatGPT, and Grok a secure, account-scoped way to reach your tools—without copying API keys between platforms.</p><a className="primary login-cta" href="#login-options">Get started <span>→</span></a><div className="platforms"><b>Works with</b><span>Claude</span><span>OpenAI</span><span>Grok</span></div></section><footer><span>Built for the open agent web.</span><span>Vercel Postgres · Private Blob · Solana</span></footer></main>;
  const user = await provisionUserForSession(session).catch(() => null);
  const db = user ? getDb() : null;
  const connectedPlatforms = user && db ? (await db.select({ platform: platformConnections.platform }).from(platformConnections).where(eq(platformConnections.userId, user.id))).map(connection => connection.platform) : [];
  const endpoint = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mcpbuddy.creatorsand.fun'}/api/mcp`;
  return <AppShell active="connections" name={user?.name ?? user?.email}><header className="app-page-head"><p className="eyebrow">CONNECTION CENTER</p><h1>Connections</h1><p>Connect and verify the AI clients that can access your private MCP workspace.</p></header><EndpointCard endpoint={endpoint} /><PlatformConnections connectedPlatforms={connectedPlatforms} /></AppShell>;
}
