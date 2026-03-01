import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer:
    process.env.CI || process.env.PLAYWRIGHT_NO_WEB_SERVER
      ? undefined
      : {
          command: 'npm run dev',
          url: 'http://localhost:3001',
          reuseExistingServer: true,
          timeout: 120000,
        },
});
