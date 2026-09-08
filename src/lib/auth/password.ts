import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing.
 *
 * argon2id through the Rust binding, which ships prebuilt binaries for every
 * platform this project runs on. The npm `argon2` package compiles with
 * node-gyp when a prebuild is missing, which on Windows means installing
 * Visual Studio build tools before anyone can run the app.
 */

export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/**
 * Never throws on a malformed stored hash. A corrupted record should fail the
 * sign-in, not return a 500 that tells an attacker the account exists.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}
