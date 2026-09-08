import type { DefaultSession } from 'next-auth';
import type { Role } from '@/lib/db/models/reference';

/**
 * Adds the two fields every authorisation decision in this app depends on.
 *
 * Without this augmentation, session.user.role is `any` and a typo like
 * `session.user.roll === 'staff'` compiles, evaluates to false, and locks
 * everyone out of a page with no error anywhere. Declaring them turns a
 * shape change in Auth.js into a TypeScript failure instead of a runtime one.
 */

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** Present only for role 'agent'. Scopes everything that account sees. */
      agentId: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    role: Role;
    agentId: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    agentId: string | null;
  }
}

/**
 * The same augmentation against @auth/core/jwt.
 *
 * next-auth re-exports the JWT interface from @auth/core, and which of the two
 * specifiers a given call site resolves to depends on how the type was
 * imported. Declaring only one leaves token.id as unknown in half the
 * callbacks, so both are declared.
 */
declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: Role;
    agentId: string | null;
  }
}
