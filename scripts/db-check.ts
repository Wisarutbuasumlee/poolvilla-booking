/**
 * Proves the app can reach MongoDB with the URI in .env.local, and reports
 * whether transactions are actually available on that deployment.
 *
 *   npx tsx scripts/db-check.ts
 */
import { config } from 'dotenv';

// Next reads .env.local; a plain node script does not, so load the same files
// Next would, in the same precedence order.
config({ path: ['.env.local', '.env'], quiet: true });
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../src/lib/db/connect';
import { withTransaction } from '../src/lib/db/session';

async function main() {
  const uri = process.env.MONGODB_URI ?? '(unset)';
  console.log('URI        ', uri.replace(/\/\/[^@]*@/, '//<credentials>@'));

  await connectToDatabase();
  const admin = mongoose.connection.db!.admin();
  const hello = await admin.command({ hello: 1 });

  console.log('connected  ', mongoose.connection.name);
  console.log('server     ', (await admin.command({ buildInfo: 1 })).version);
  console.log('replica set', hello.setName ?? 'none (standalone: no transactions)');

  // Report what the app is configured to do, then probe what the server can
  // actually do. These are different questions and conflating them is how you
  // end up believing a standalone rolled something back.
  const configured = process.env.MONGODB_TRANSACTIONS === 'true';
  console.log(
    'configured ',
    configured
      ? 'transactions ON'
      : 'transactions OFF (unique index still enforces booking safety)',
  );

  // Force the probe on regardless of configuration, so this reports the
  // deployment's real capability rather than the current setting.
  process.env.MONGODB_TRANSACTIONS = 'true';
  try {
    await withTransaction(async (session) => {
      await mongoose.connection.collection('__db_check').insertOne({ at: new Date() }, { session });
      throw new Error('__rollback__');
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      'supported  ',
      message === '__rollback__' ? 'yes (rolled back cleanly)' : 'no: ' + message,
    );
  } finally {
    process.env.MONGODB_TRANSACTIONS = configured ? 'true' : 'false';
  }

  const left = await mongoose.connection.collection('__db_check').countDocuments();
  console.log('rollback   ', left === 0 ? 'verified, nothing written' : `LEAKED ${left} docs`);

  await mongoose.connection
    .collection('__db_check')
    .drop()
    .catch(() => {});
  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error('\nFAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
