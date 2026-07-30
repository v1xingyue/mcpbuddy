import { redirect } from 'next/navigation';
import { and, eq, ne } from 'drizzle-orm';
import { auth } from '@/auth';
import { mergeDuplicateAccount, provisionUserForSession } from '@/app/actions';
import { AppShell } from '@/components/app-shell';
import { IdentityBindings } from '@/components/identity-bindings';
import { WalletButton } from '@/components/wallet-button';
import { UserInfoEditor } from '@/components/user-info-editor';
import { getDb } from '@/lib/db';
import { authIdentities, users, walletBindings } from '@/lib/db/schema';

export default async function AccountPage() {
  const session = await auth(); if (!session?.user) redirect('/');
  const user = await provisionUserForSession(session); if (!user) redirect('/');
  const db = getDb();
  const [[wallet], identities, duplicates] = await Promise.all([
    db.select({ address: walletBindings.address }).from(walletBindings).where(eq(walletBindings.userId, user.id)).limit(1),
    db.select({ provider: authIdentities.provider }).from(authIdentities).where(eq(authIdentities.userId, user.id)),
    db.select({ id: users.id, name: users.name, createdAt: users.createdAt }).from(users).where(and(eq(users.email, user.email), ne(users.id, user.id))),
  ]);
  return <AppShell active="account" name={user.name ?? user.email}><header className="app-page-head"><p className="eyebrow">ACCOUNT OPERATIONS</p><h1>Your account</h1><p>Manage the sign-in methods and wallet that secure your MCPBuddy workspace.</p></header><section className="account-summary"><div><p className="label">PRIMARY EMAIL</p><b>{user.email}</b><small>Used only to find duplicate GitHub or Google accounts. Merges always need your confirmation.</small></div><div><p className="label">SOLANA WALLET</p><WalletButton address={wallet?.address} /></div></section><IdentityBindings providers={identities.map(identity => identity.provider)} /><UserInfoEditor initialValue={user.userInfo} />{duplicates.length > 0 && <section className="merge-card"><p className="label">ACCOUNT MATCH FOUND</p><h2>Merge duplicate accounts</h2><p>We found another account using the same email. Merging moves its pages and AI connections into this workspace.</p>{duplicates.map(account => <div className="merge-row" key={account.id}><div><b>{account.name ?? 'MCPBuddy account'}</b><small>Created {account.createdAt.toLocaleDateString()}</small></div><form action={mergeDuplicateAccount.bind(null, account.id)}><button type="submit">Review & merge</button></form></div>)}</section>}</AppShell>;
}
