import type { NextAuthConfig } from 'next-auth';

/**
 * Auth configuration WITHOUT any provider.
 *
 * The Credentials provider needs Mongoose and argon2. Keeping it out of this
 * file means anything that only needs the session shape, callbacks or cookie
 * settings can import this without dragging a database driver and a native
 * module along with it.
 *
 * The real provider lives in src/auth.ts, which is the only module that should
 * ever be imported from a Server Component or route handler.
 */
export const authConfig = {
  // JWT rather than a database session: the back office is small, the token
  // carries role and agentId, and it keeps every page render from needing a
  // session lookup.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on the sign-in pass.
      if (user) {
        token.id = user.id ?? '';
        token.role = user.role;
        token.agentId = user.agentId;
      }
      return token;
    },

    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.agentId = token.agentId;
      return session;
    },
  },

  providers: [],
} satisfies NextAuthConfig;
