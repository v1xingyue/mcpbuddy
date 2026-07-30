import { auth, signIn } from '@/auth';
import { mergeDuplicateAccount, provisionUser } from './actions';
import { EndpointCard } from '@/components/endpoint-card';
import { PlatformConnections } from '@/components/platform-connections';
import { AppShell } from '@/components/app-shell';
import { WalletLoginButton } from '@/components/wallet-login-button';
import { IdentityBindings } from '@/components/identity-bindings';
import { getDb } from '@/lib/db';
import { authIdentities, users, walletBindings, platformConnections } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';

export default async function Home() {
  const session = await auth();
  if (!session?.user) return <main className="marketing"><nav><a className="brand" href="/">mcp<span>buddy</span></a><details className="login-menu" id="login-options"><summary>Log in</summary><div><form action={async () => { 'use server'; await signIn('github'); }}><button>Log in with GitHub</button></form><form action={async () => { 'use server'; await signIn('google'); }}><button className="google-auth">Log in with Google</button></form><WalletLoginButton /></div></details></nav><section className="hero"><p className="eyebrow">PRIVATE MCP INFRASTRUCTURE</p><h1>One connection center.<br/><i>Every AI client.</i></h1><p className="lead">Give Claude, ChatGPT, and Grok a secure, account-scoped way to reach your tools—without copying API keys between platforms.</p><a className="primary login-cta" href="#login-options">Get started <span>→</span></a><div className="platforms"><b>Works with</b><span>Claude</span><span>OpenAI</span><span>Grok</span></div></section><footer><span>Built for the open agent web.</span><span>Vercel Postgres · Private Blob · Solana</span></footer></main>;
  const user = await provisionUser().catch(() => null);
  const db = user ? getDb() : null;
  const duplicates = user && db ? await db.select({ id: users.id, name: users.name, createdAt: users.createdAt }).from(users).where(and(eq(users.email, user.email), ne(users.id, user.id))) : [];
  if (user && duplicates.length) return <AppShell active="connections" name={session.user.name}><header className="app-page-head"><p className="eyebrow">ACCOUNT MATCH FOUND</p><h1>Merge accounts</h1><p>Another MCPBuddy account uses the same email address. Review and merge it before continuing so your data stays in one workspace.</p></header><section className="merge-card"><p className="label">SAME EMAIL ADDRESS</p>{duplicates.map(account => <div className="merge-row" key={account.id}><div><b>{account.name ?? 'MCPBuddy account'}</b><small>Created {account.createdAt.toLocaleDateString()}</small></div><form action={mergeDuplicateAccount.bind(null, account.id)}><button type="submit">Merge into this account</button></form></div>)}</section></AppShell>;
  const wallet = user && db ? (await db.select().from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1))[0]?.address : undefined;
  const identities = user && db ? await db.select({ provider: authIdentities.provider }).from(authIdentities).where(eq(authIdentities.userId, user.id)) : [];
  const connectedPlatforms = user && db ? (await db.select({ platform: platformConnections.platform }).from(platformConnections).where(eq(platformConnections.userId, user.id))).map(connection => connection.platform) : [];
  const endpoint = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mcpbuddy.creatorsand.fun'}/api/mcp`;
  return <AppShell active="connections" name={session.user.name}><header className="app-page-head"><p className="eyebrow">CONNECTION CENTER</p><h1>Connections</h1><p>Connect and verify the AI clients that can access your private MCP workspace.</p></header><EndpointCard endpoint={endpoint} wallet={wallet} /><IdentityBindings providers={identities.map(identity => identity.provider)} /><PlatformConnections connectedPlatforms={connectedPlatforms} /></AppShell>;
}
