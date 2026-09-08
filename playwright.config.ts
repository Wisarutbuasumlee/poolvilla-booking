import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * These drive a real browser against a real server against a real database.
 * They are slow and they are the only thing that proves the pieces fit: the
 * unit tests know the pricing engine is right and the integration tests know
 * the calendar cannot double book, but neither one knows whether a guest can
 * actually get from the home page to a confirmed booking.
 *
 * Prerequisite: the MongoDB this project uses must be running. It is not
 * started here and it is not started by the app either, because this project
 * owns no containers; see scripts/dev.mjs. Sample data is seeded on the first
 * run into an empty database.
 *
 * The dev server is started for you unless one is already listening.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',

  // A failing e2e test is usually a real failure, not a flake, and a retry
  // that turns red into green hides exactly the intermittent bugs this suite
  // exists to catch. One retry in CI only, for genuine infrastructure noise.
  retries: process.env.CI ? 1 : 0,

  // These share one database. Running them in parallel would have them
  // booking each other's nights.
  workers: 1,
  fullyParallel: false,

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3200',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    // Evidence for the failures that only happen on someone else's machine.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Most Thai guests book from a phone, so the booking flow is checked
      // there too rather than assumed to follow from the desktop pass.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /booking\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3200/th',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
