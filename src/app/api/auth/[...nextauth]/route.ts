import { handlers } from '@/auth';

// The Credentials provider verifies an argon2 hash and reads MongoDB, so this
// route runs on Node. It is also excluded from the proxy matcher: an auth
// endpoint must never be routed through the surface-selection logic.
export const runtime = 'nodejs';

export const { GET, POST } = handlers;
