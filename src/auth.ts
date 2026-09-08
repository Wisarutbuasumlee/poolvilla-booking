import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { connectToDatabase } from '@/lib/db/connect';
import { UserModel } from '@/lib/db/models/reference';
import { verifyPassword } from '@/lib/auth/password';
import { SignInSchema } from '@/lib/validation/auth';

/**
 * The real Auth.js instance. Import this, never auth.config directly, from
 * anything that has to authenticate a request.
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(raw) {
        const parsed = SignInSchema.safeParse(raw);
        if (!parsed.success) return null;

        await connectToDatabase();

        // passwordHash is select:false on the schema, so it has to be asked
        // for explicitly. That default is what stops it leaking through an
        // unrelated query that gets serialised to the client.
        const user = await UserModel.findOne({ email: parsed.data.email })
          .select('+passwordHash')
          .lean();

        // Verify even when the account does not exist, against a throwaway
        // hash, so a missing account and a wrong password take the same time.
        // Returning early here turns the sign-in form into an account
        // enumeration oracle.
        const storedHash = user?.passwordHash ?? DUMMY_HASH;
        const passwordMatches = await verifyPassword(storedHash, parsed.data.password);

        if (!user || !user.isActive || !passwordMatches) return null;

        // Best effort. A failed timestamp write must not fail the sign-in.
        void UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(
          () => {},
        );

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          agentId: user.agentId ? user.agentId.toString() : null,
        };
      },
    }),
  ],
});

/**
 * A real argon2id hash of a value nobody uses, so the no-such-account path
 * performs the same work as the wrong-password path.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$1PL5Bq/kJmYEHnrn4v3Wm1nqRJ0X3Zj6HqO5ZP0Bv8Q';
