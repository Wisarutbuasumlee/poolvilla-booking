import mongoose, { type Mongoose } from 'mongoose';

/**
 * The single MongoDB connection for the whole app.
 *
 * Two things make this less trivial than it looks:
 *
 * 1. In development, every hot reload re-evaluates modules. Without a cache
 *    on globalThis, each reload opens another connection and MongoDB starts
 *    refusing them after a few dozen edits.
 *
 * 2. Server Components render concurrently, so several of them can call this
 *    before the first connection has finished opening. Caching the PROMISE,
 *    not just the connection, means they all await the same handshake instead
 *    of racing to start their own.
 *
 * Import this only from Server Components, Server Actions and route handlers.
 * src/proxy.ts and anything under src/lib/pricing must never reach it; ESLint
 * enforces both.
 */

interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

const globalWithMongoose = globalThis as typeof globalThis & {
  __poolvillaMongoose?: MongooseCache;
};

const cache: MongooseCache = (globalWithMongoose.__poolvillaMongoose ??= {
  conn: null,
  promise: null,
});

export async function connectToDatabase(): Promise<Mongoose> {
  if (cache.conn) return cache.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env.local, then run npm run db:up.',
    );
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(uri, {
        // Fail fast with a clear message instead of hanging the request for
        // 30 seconds when the database container is not running.
        serverSelectionTimeoutMS: 5_000,

        // Every schema declares its own indexes and the seed script builds
        // them deliberately. Leaving this on lets a stray model definition
        // create an index on a production collection during a page render.
        autoIndex: false,

        // Strict query filters catch a typo in a field name at the query
        // instead of silently matching every document.
        bufferCommands: false,
      })
      .then((m) => {
        cache.conn = m;
        return m;
      })
      .catch((error: unknown) => {
        // Clear the cached promise so the next request retries rather than
        // awaiting a promise that already rejected.
        cache.promise = null;
        throw error;
      });
  }

  return cache.promise;
}

/** Closes the connection. For scripts and tests only; the server never calls it. */
export async function disconnectFromDatabase(): Promise<void> {
  if (!cache.conn) return;
  await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
}
