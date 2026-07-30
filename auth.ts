import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub, Google],
  callbacks: {
    async jwt({ token, profile, account }) {
      if (profile && account) {
        const providerAccountId = 'sub' in profile ? profile.sub : ('id' in profile ? profile.id : undefined);
        if (providerAccountId) token.accountId = account.provider === 'github' ? String(providerAccountId) : `${account.provider}:${providerAccountId}`;
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
