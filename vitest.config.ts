import { defineConfig } from 'vitest/config';

/**
 * Two kinds of test, run differently.
 *
 * ---------------------------------------------------------------------------
 * Unit tests, three times over
 * ---------------------------------------------------------------------------
 * The pricing engine runs on UTC, on Asia/Bangkok, and on a timezone a day
 * behind Bangkok, and has to produce identical output on all three.
 *
 * This is the most valuable check in the suite. Every timezone bug this
 * codebase can have looks like "works on my machine": a laptop set to Bangkok
 * agrees with a UTC server for most of the day and disagrees after 5pm local.
 * Running the same assertions from Los Angeles turns that class of bug into a
 * red test instead of a support ticket in April.
 *
 * Three named projects rather than a loop, so a failure says which timezone.
 *
 * ---------------------------------------------------------------------------
 * Integration tests, once, against a real MongoDB
 * ---------------------------------------------------------------------------
 * Double booking cannot be tested against a mock. The protection comes from a
 * unique index enforced by the storage engine, so the storage engine has to be
 * there. These need `npm run db:up` and are skipped with a clear message when
 * it is not running.
 *
 * They also run single-file and single-fork: several of them deliberately
 * contend for the same villa and the same nights, and running them in parallel
 * would have them fighting each other rather than testing the mechanism.
 */

const TIMEZONES = ['UTC', 'Asia/Bangkok', 'America/Los_Angeles'] as const;

const INTEGRATION = '**/*.integration.test.ts';

export default defineConfig({
  // Vite resolves the @/* aliases from tsconfig natively.
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      ...TIMEZONES.map((timezone) => ({
        resolve: { tsconfigPaths: true },
        test: {
          name: `tz:${timezone}`,
          environment: 'node' as const,
          include: ['src/**/*.test.ts'],
          exclude: [INTEGRATION],
          // Set before the worker imports any test file, so Date picks it up.
          env: { TZ: timezone },
        },
      })),
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: 'integration',
          environment: 'node' as const,
          include: [`src/**/${INTEGRATION.replace('**/', '')}`],
          env: { TZ: 'UTC' },
          // These deliberately contend for the same villa and the same
          // nights, so running them in parallel would have them fighting each
          // other instead of testing the mechanism.
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
