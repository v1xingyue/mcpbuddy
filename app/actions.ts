'use server';

import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { authIdentities, users, walletBindings } from '@/lib/db/schema';
import { publishedPages } from '@/lib/db/schema';
import { walletChallenges } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { del } from '@vercel/blob';
import { env } from '@/lib/config';
import { revalidatePath } from 'next/cache';

export async function provisionUser() {
  const session = await auth(); if (!session?.user?.id || !session.user.email) return null;
  const db = getDb();
  const separator = session.user.id.indexOf(':');
  const provider = separator > 0 ? session.user.id.slice(0, separator) : 'github';
  const providerAccountId = separator > 0 ? session.user.id.slice(separator + 1) : session.user.id;
  const [identity] = await db.select().from(authIdentities).where(and(eq(authIdentities.provider, provider), eq(authIdentities.providerAccountId, providerAccountId))).limit(1);
  if (identity) {
    const [user] = await db.select().from(users).where(eq(users.id, identity.userId)).limit(1);
    if (user) return user;
  }
  // Accounts created before multi-provider support only have github_id. Adopt them on first login.
  if (provider === 'github') {
    const [legacyUser] = await db.select().from(users).where(eq(users.githubId, providerAccountId)).limit(1);
    if (legacyUser) {
      await db.insert(authIdentities).values({ userId: legacyUser.id, provider, providerAccountId }).onConflictDoNothing();
      return legacyUser;
    }
  }
  const [user] = await db.insert(users).values({ githubId: session.user.id, email: session.user.email, name: session.user.name, image: session.user.image }).returning();
  await db.insert(authIdentities).values({ userId: user.id, provider, providerAccountId });
  return user;
}

export async function createWalletChallenge() {
  const user = await provisionUser(); if (!user) throw new Error('Sign in to MCPBuddy first.');
  const nonce = crypto.randomUUID(); const db = getDb(); const expiresAt = new Date(Date.now() + 5 * 60_000);
  await db.insert(walletChallenges).values({ userId: user.id, nonce, expiresAt });
  return `MCPBuddy wallet binding\nMCPBuddy account: ${user.githubId}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}`;
}

export async function bindWallet(address: string, message: string, signature: number[]) {
  const user = await provisionUser(); if (!user) throw new Error('Sign in to MCPBuddy first.');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error('Invalid Solana address.');
  const nonce = message.match(/Nonce: ([\w-]+)/)?.[1]; if (!nonce) throw new Error('Invalid wallet challenge.');
  const db = getDb(); const [challenge] = await db.select().from(walletChallenges).where(and(eq(walletChallenges.userId, user.id), eq(walletChallenges.nonce, nonce), gt(walletChallenges.expiresAt, new Date()))).limit(1);
  if (!challenge || !message.includes(`MCPBuddy account: ${user.githubId}`)) throw new Error('Wallet challenge expired or invalid.');
  if (!nacl.sign.detached.verify(new TextEncoder().encode(message), new Uint8Array(signature), bs58.decode(address))) throw new Error('Wallet signature verification failed.');
  await db.delete(walletChallenges).where(eq(walletChallenges.id, challenge.id));
  await db.insert(walletBindings).values({ userId: user.id, address }).onConflictDoUpdate({ target: walletBindings.userId, set: { address, verifiedAt: new Date() } });
  return address;
}

export async function deletePublishedPage(pageId: string) {
  const user = await provisionUser(); if (!user) throw new Error('Sign in to MCPBuddy first.');
  const db = getDb(); const [page] = await db.select().from(publishedPages).where(and(eq(publishedPages.id, pageId), eq(publishedPages.userId, user.id))).limit(1);
  if (!page) throw new Error('Page not found.');
  if (page.blobUrl && env.BLOB_READ_WRITE_TOKEN) await del(page.blobUrl, { token: env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
  await db.delete(publishedPages).where(eq(publishedPages.id, page.id));
  revalidatePath('/'); revalidatePath(`/pages/${page.id}`); if (page.publicId) revalidatePath(`/p/${page.publicId}`);
}
