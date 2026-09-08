import { spawn, spawnSync } from 'node:child_process';
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });

/**
 * One command to start working: `npm run dev`.
 *
 * Brings up the containers, seeds ONLY when the database is empty, then starts
 * Next.
 *
 * The conditional seed is the whole point. Seeding is destructive: it wipes
 * every collection it owns and rebuilds them. Running it on every start would
 * delete the villa you just added and the booking you just made to test with,
 * every time you restarted the server. So it runs when there is nothing to
 * lose, and never again unless you ask with `npm run seed`.
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

// ---------------------------------------------------------------------------
// 1. Containers
// ---------------------------------------------------------------------------

const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

if (docker.status !== 0) {
  fail(
    'Docker is not running.',
    'Start Docker Desktop and try again.\nThe app needs MongoDB, which runs in a container.',
  );
}

step('starting mongodb, redis and mongo-express');

// --wait blocks until every healthcheck passes, so nothing below races a
// database that is still initialising its replica set.
const up = spawnSync('docker', ['compose', 'up', '-d', '--wait'], {
  stdio: ['ignore', 'ignore', 'pipe'],
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

if (up.status !== 0) {
  fail('Could not start the containers.', up.stderr?.trim());
}

ok('containers healthy');

// ---------------------------------------------------------------------------
// 2. Seed, but only into an empty database
// ---------------------------------------------------------------------------

const { default: mongoose } = await import('mongoose');

let villaCount = 0;
try {
  await mongoose.connect(process.env.MONGODB_URI ?? '', { serverSelectionTimeoutMS: 8_000 });
  villaCount = await mongoose.connection.db.collection('villas').countDocuments();
  await mongoose.disconnect();
} catch (error) {
  fail(
    'Could not reach MongoDB.',
    `${error instanceof Error ? error.message : error}\nCheck MONGODB_URI in .env.local`,
  );
}

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

// ---------------------------------------------------------------------------
// 3. Next
// ---------------------------------------------------------------------------

if (!process.env.AUTH_SECRET) {
  warn('AUTH_SECRET is not set, so signing in will fail. Generate one with: npx auth secret');
}

console.log('');

const next = spawn('npx', ['next', 'dev'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// Ctrl-C should stop the dev server and leave the containers running: they
// take time to come back and nothing else on the machine wants them stopped.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    next.kill(signal);
  });
}

next.on('exit', (code) => process.exit(code ?? 0));
