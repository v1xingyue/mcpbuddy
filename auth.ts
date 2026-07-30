import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { jwtVerify } from 'jose';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { getDb } from '@/lib/db';
import { authIdentities, oauthTokenUses, users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub, Google, Credentials({
    id: 'solana',
    name: 'Solana wallet',
    credentials: { address: {}, message: {}, signature: {}, challenge: {} },
    async authorize(credentials) {
      const address = typeof credentials?.address === 'string' ? credentials.address : '';
      const message = typeof credentials?.message === 'string' ? credentials.message : '';
      const signature = typeof credentials?.signature === 'string' ? credentials.signature : '';
      const challenge = typeof credentials?.challenge === 'string' ? credentials.challenge : '';
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) || !message || !signature || !challenge) return null;
      try {
        const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
        const { payload } = await jwtVerify(challenge, secret);
        if (payload.typ !== 'wallet_login' || payload.sub !== address || typeof payload.jti !== 'string') return null;
        if (!nacl.sign.detached.verify(new TextEncoder().encode(message), Uint8Array.from(JSON.parse(signature)), bs58.decode(address))) return null;
        const [use] = await getDb().insert(oauthTokenUses).values({ kind: 'wallet_login', jti: payload.jti }).onConflictDoNothing().returning();
        if (!use) return null; // a challenge can authenticate exactly once
        return { id: `wallet:${address}`, name: `Wallet ${address.slice(0, 5)}…${address.slice(-4)}`, email: `${address.toLowerCase()}@wallet.mcpbuddy.local` };
      } catch { return null; }
    },
  })],
  callbacks: {
    async jwt({ token, profile, account, user }) {
      if (account?.provider === 'solana' && user?.id) token.accountId = user.id;
      if (profile && account) {
        const providerAccountId = 'sub' in profile ? profile.sub : ('id' in profile ? profile.id : undefined);
        if (providerAccountId) {
          const provider = account.provider;
          const accountId = String(providerAccountId);
          const linkCookie = (await cookies()).get('mcpbuddy_link')?.value;
          if (linkCookie) {
            try {
              const { payload } = await jwtVerify(linkCookie, new TextEncoder().encode(process.env.AUTH_SECRET));
              if (payload.typ === 'identity_link' && payload.provider === provider && typeof payload.sub === 'string') {
                const db = getDb();
                const [existing] = await db.select().from(authIdentities).where(and(eq(authIdentities.provider, provider), eq(authIdentities.providerAccountId, accountId))).limit(1);
                const [target] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
                if (target && (!existing || existing.userId === target.id)) {
                  await db.insert(authIdentities).values({ userId: target.id, provider, providerAccountId: accountId }).onConflictDoNothing();
                  token.accountId = target.githubId;
                  (await cookies()).delete('mcpbuddy_link');
                  return token;
                }
              }
            } catch { /* invalid or expired link intent falls back to a normal sign-in */ }
          }
          token.accountId = provider === 'github' ? accountId : `${provider}:${accountId}`;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // GitHub identities retain their historical unprefixed form. Other providers are namespaced.
      if (session.user) session.user.id = String(token.accountId ?? token.githubId ?? token.sub ?? '');
      return session;
    },
  },
});
