import mongoose, { type ClientSession } from 'mongoose';
import { connectToDatabase } from './connect';

/**
 * Runs a unit of work, inside a transaction when the deployment supports one.
 *
 * Transactions are a SAFETY NET here, not the correctness mechanism. Double
 * booking is prevented by the unique index on {villaId, dateKey} plus scoped
 * compensation in src/lib/availability; see docs/DECISIONS.md D-003. That
 * matters because a plain mongod cannot start a transaction at all, so a
 * design that depended on one would fail on a developer machine and tempt
 * someone to strip it out "temporarily".
 *
 * Because of that, every call site passes the session straight through and
 * behaves identically whether it receives one or undefined.
 */
export async function withTransaction<T>(fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  await connectToDatabase();

  if (process.env.MONGODB_TRANSACTIONS !== 'true') {
    return fn(undefined);
  }

  const session = await mongoose.startSession();
  try {
    // withTransaction retries on transient errors and on commit-unknown
    // results, which is the whole reason to prefer it over start/commit.
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}
