import { defineConfig, devices } from '@playwright/test';

const appPort = 3200;
const seafilePort = 4100;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The fake Seafile service is intentionally stateful so mutation journeys run deterministically.
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: /responsive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: `FAKE_SEAFILE_PORT=${seafilePort} node tests/e2e/fixtures/fake-seafile.mjs`,
      url: `http://127.0.0.1:${seafilePort}/api2/ping/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `NEXT_DIST_DIR=.next-e2e SEAFILE_URL=http://127.0.0.1:${seafilePort} PUBLIC_SEAFILE_URL=http://127.0.0.1:${seafilePort} APP_URL=http://127.0.0.1:${appPort} SESSION_SECRET=e2e-session-secret-that-is-at-least-32-characters APP_NAME='Grapple Drive' npm run dev -- --hostname 127.0.0.1 --port ${appPort}`,
      url: `http://127.0.0.1:${appPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
