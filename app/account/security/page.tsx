import { redirect } from 'next/navigation';
import { and, eq, ne } from 'drizzle-orm';
import { auth } from '@/auth';
import { mergeDuplicateAccount, provisionUserForSession } from '@/app/actions';
import { IdentityBindings } from '@/components/identity-bindings';
import { getDb } from '@/lib/db';
import { authIdentities, users, walletBindings } from '@/lib/db/schema';

export default async function AccountSecurityPage() {
  const user = await provisionUserForSession(await auth());
  if (!user) redirect('/');
  const db = getDb();
  const [identities, [wallet], duplicates] = await Promise.all([
    db.select({ provider: authIdentities.provider }).from(authIdentities).where(eq(authIdentities.userId, user.id)),
    db.select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1),
    db.select({ id: users.id, name: users.name, createdAt: users.createdAt }).from(users).where(and(eq(users.email, user.email), ne(users.id, user.id))),
  ]);
  const providers = [...identities.map(identity => identity.provider), ...(wallet && !identities.some(identity => identity.provider === 'wallet') ? ['wallet'] : [])];

  return <><header className="app-page-head"><p className="eyebrow">ACCOUNT · SECURITY</p><h1>Sign-in & security</h1><p>Manage the sign-in methods that secure your MCPBuddy workspace.</p></header>
    <IdentityBindings providers={providers} />
    {duplicates.length > 0 && <section className="merge-card"><p className="label">ACCOUNT MATCH FOUND</p><h2>Merge duplicate accounts</h2><p>We found another account using the same email. Merging moves its pages and AI connections into this workspace.</p>{duplicates.map(account => <div className="merge-row" key={account.id}><div><b>{account.name ?? 'MCPBuddy account'}</b><small>Created {account.createdAt.toLocaleDateString()}</small></div><form action={mergeDuplicateAccount.bind(null, account.id)}><button type="submit">Review & merge</button></form></div>)}</section>}
  </>;
}
