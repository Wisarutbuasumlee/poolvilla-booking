import { spawn, spawnSync } from 'node:child_process';
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });

/**
 * One command to start working: `npm run dev`.
 *
 * Checks that MongoDB answers, seeds ONLY when the database is empty, then
 * starts Next on the port this project owns.
 *
 * THIS PROJECT RUNS NO CONTAINERS OF ITS OWN. It shares the MongoDB already
 * running on this machine and uses its own database inside it. An earlier
 * version started a MongoDB, a Redis and a mongo-express, which fought the ERP
 * stack over port 27017: whichever started second lost, and the symptom looked
 * like an application bug rather than a port collision. Redis and mongo-express
 * were conveniences, not requirements. The rate limiter falls back to an
 * in-process counter when REDIS_URL is unset, and mongo-express only ever
 * looked at data you can read from the app.
 *
 * `--app-only` skips the database check and the seed and starts Next alone.
 * That is what `npm run dev:next` runs, and it exists so the port lives in
 * exactly one place: this file reads PORT and both entry points get it.
 */

const RESET = '[0m';
const DIM = '[2m';
const GREEN = '[32m';
const YELLOW = '[33m';
const RED = '[31m';

function step(message) {
  console.log(`${DIM}·${RESET} ${message}`);
}

function ok(message) {
  console.log(`${GREEN}✓${RESET} ${message}`);
}

function warn(message) {
  console.log(`${YELLOW}!${RESET} ${message}`);
}

function fail(message, detail) {
  console.error(`\n${RED}✗${RESET} ${message}`);
  if (detail) console.error(`${DIM}${detail}${RESET}`);
  process.exit(1);
}

const appOnly = process.argv.includes('--app-only');

// 3200, not 3000. The ERP project's dev servers hold 3000 and 3001 on this
// machine. Falling back to 3000 on a missing PORT would walk straight back
// into that collision, so the fallback is 3200 as well.
const port = process.env.PORT ?? '3200';

if (!appOnly) {
  // -------------------------------------------------------------------------
  // 1. The database has to be there. We do not start it.
  // -------------------------------------------------------------------------

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    fail(
      'MONGODB_URI is not set.',
      'Copy .env.example to .env.local and fill it in, then run this again.',
    );
  }

  const { default: mongoose } = await import('mongoose');

  let villaCount = 0;
  let dbName = 'unknown database';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8_000 });
    const db = mongoose.connection.db;
    if (!db) throw new Error('Connected, but MONGODB_URI names no database.');
    dbName = db.databaseName;
    villaCount = await db.collection('villas').countDocuments();
    await mongoose.disconnect();
  } catch (error) {
    fail(
      'Could not reach MongoDB.',
      [
        error instanceof Error ? error.message : String(error),
        '',
        'This project does not start MongoDB. It expects the one already',
        'running on this machine and connects to it with MONGODB_URI from',
        '.env.local. Check that the server is up, then try again.',
      ].join('\n'),
    );
  }

  ok(`mongodb reachable, database ${dbName}`);

  // -------------------------------------------------------------------------
  // 2. Seed, but only into an empty database
  // -------------------------------------------------------------------------
  //
  // The conditional seed is the whole point. Seeding is destructive: it wipes
  // every collection it owns and rebuilds them. Running it on every start
  // would delete the villa you just added and the booking you just made to
  // test with, every time you restarted the server. So it runs when there is
  // nothing to lose, and never again unless you ask with `npm run seed`.

  if (villaCount === 0) {
    step('database is empty, seeding sample data');

    const seed = spawnSync('npm', ['run', 'seed'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    if (seed.status !== 0) fail('Seeding failed.');
  } else {
    ok(`database has ${villaCount} villas, leaving it alone`);
    console.log(`${DIM}  run "npm run seed" to wipe and rebuild the sample data${RESET}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Next
// ---------------------------------------------------------------------------

if (!process.env.AUTH_SECRET) {
  warn('AUTH_SECRET is not set, so signing in will fail. Generate one with: npx auth secret');
}

console.log('');

const next = spawn('npx', ['next', 'dev', '-p', port], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

next.on('error', (error) => fail('Could not start Next.', error.message));

// On Windows `shell: true` means the child is the cmd.exe wrapper, not Next
// itself. Killing the wrapper orphans the real server, which keeps holding the
// port, so the next start silently lands on the one above it and the admin
// hostname in ADMIN_HOSTNAMES stops matching. taskkill /T ends the whole tree.
function stopNext(signal) {
  if (next.exitCode !== null || next.signalCode !== null) return;
  if (process.platform === 'win32' && next.pid) {
    spawnSync('taskkill', ['/pid', String(next.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    next.kill(signal);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopNext(signal));
}

next.on('exit', (code, signal) => {
  if (code !== null) process.exit(code);
  // Killed by a signal: Ctrl-C and a normal shutdown are not failures.
  process.exit(signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
});
