import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile && 'id' in profile) token.githubId = String(profile.id);
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = String(token.githubId ?? token.sub ?? '');
      return session;
    },
  },
});
