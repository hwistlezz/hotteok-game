import { defineConfig, devices } from '@playwright/test'

const storage = `.tool-cache/e2e-${process.pid}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    defaultBrowserType: 'chromium',
    baseURL: 'http://127.0.0.1:8787',
  },
  webServer: {
    command: [
      'npm run build',
      `npm run db:local -- --persist-to ${storage}`,
      `npm run dev:worker -- --persist-to ${storage}`,
    ].join(' && '),
    url: 'http://127.0.0.1:8787',
    env: { WRANGLER_SEND_METRICS: 'false' },
    timeout: 60_000,
  },
})
