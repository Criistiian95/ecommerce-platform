import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test-static',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chromium', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run preview:static -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
