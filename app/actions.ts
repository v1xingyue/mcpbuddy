'use server';

import { auth } from '@/auth';
import type { Session } from 'next-auth';
import { getDb } from '@/lib/db';
import { authIdentities, mcpConnections, platformConnections, users, walletBindings } from '@/lib/db/schema';
import { publishedPages } from '@/lib/db/schema';
import { walletChallenges } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { del } from '@vercel/blob';
import { env } from '@/lib/config';
import { revalidatePath } from 'next/cache';

export async function provisionUserForSession(session: Session | null) {
  if (!session?.user?.id || !session.user.email) return null;
  const db = getDb();
  const separator = session.user.id.indexOf(':');
  const provider = separator > 0 ? session.user.id.slice(0, separator) : 'github';
  const providerAccountId = separator > 0 ? session.user.id.slice(separator + 1) : session.user.id;
  // Wallet bindings existed before wallet sign-in. They are the source of truth for those
  // historical accounts, so a valid wallet signature never creates a second user record.
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

export async function provisionUser() { return provisionUserForSession(await auth()); }

/** Merge only accounts carrying the exact same OAuth email after the signed-in user confirms it. */
export async function mergeDuplicateAccount(duplicateUserId: string) {
  const primary = await provisionUser();
  if (!primary) throw new Error('Sign in to MCPBuddy first.');
  if (duplicateUserId === primary.id) throw new Error('This is already your active account.');
  const db = getDb();
  const [duplicate] = await db.select().from(users).where(eq(users.id, duplicateUserId)).limit(1);
  if (!duplicate || duplicate.email.toLowerCase() !== primary.email.toLowerCase()) throw new Error('This account cannot be merged.');
  const [primaryWallet] = await db.select().from(walletBindings).where(eq(walletBindings.userId, primary.id)).limit(1);
  const [duplicateWallet] = await db.select().from(walletBindings).where(eq(walletBindings.userId, duplicate.id)).limit(1);
  if (primaryWallet && duplicateWallet && primaryWallet.address !== duplicateWallet.address) throw new Error('Both accounts have different Solana wallets. Unbind one wallet before merging.');
  await db.transaction(async (tx) => {
    const primaryPlatforms = await tx.select({ platform: platformConnections.platform }).from(platformConnections).where(eq(platformConnections.userId, primary.id));
    for (const { platform } of primaryPlatforms) await tx.delete(platformConnections).where(and(eq(platformConnections.userId, duplicate.id), eq(platformConnections.platform, platform)));
    await tx.update(platformConnections).set({ userId: primary.id }).where(eq(platformConnections.userId, duplicate.id));
    await tx.update(mcpConnections).set({ userId: primary.id }).where(eq(mcpConnections.userId, duplicate.id));
    await tx.update(publishedPages).set({ userId: primary.id }).where(eq(publishedPages.userId, duplicate.id));
    await tx.update(walletChallenges).set({ userId: primary.id }).where(eq(walletChallenges.userId, duplicate.id));
    if (!primaryWallet && duplicateWallet) await tx.update(walletBindings).set({ userId: primary.id }).where(eq(walletBindings.userId, duplicate.id));
    await tx.update(authIdentities).set({ userId: primary.id }).where(eq(authIdentities.userId, duplicate.id));
    await tx.delete(users).where(eq(users.id, duplicate.id));
  });
  revalidatePath('/'); revalidatePath('/pages'); revalidatePath('/tools');
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
  await db.insert(authIdentities).values({ userId: user.id, provider: 'wallet', providerAccountId: address }).onConflictDoNothing();
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
