import { defineConfig } from 'vitest/config';

/**
 * The pricing engine runs three times, on three different host timezones, and
 * has to produce byte-identical output every time.
 *
 * This is the single most valuable check in the suite. Every timezone bug this
 * codebase can have looks like "works on my machine": a developer laptop set
 * to Asia/Bangkok agrees with a UTC server for most of the day and disagrees
 * after 5pm local. Running the same assertions from a timezone a day behind
 * Bangkok turns that class of bug into a red test instead of a support ticket.
 *
 * Three projects rather than a loop, so a failure names the offending timezone.
 */
const TIMEZONES = ['UTC', 'Asia/Bangkok', 'America/Los_Angeles'] as const;

export default defineConfig({
  // Vite resolves the @/* aliases from tsconfig natively; the
  // vite-tsconfig-paths plugin is no longer needed for this.
  resolve: { tsconfigPaths: true },
  test: {
    projects: TIMEZONES.map((timezone) => ({
      test: {
        name: `tz:${timezone}`,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        // Set before the worker imports any test file, so Date picks it up.
        env: { TZ: timezone },
      },
    })),
  },
});
