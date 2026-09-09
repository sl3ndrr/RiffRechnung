import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', testIgnore: '**/fallback.spec.ts', use: { browserName: 'chromium', channel: 'chromium' } },
    { name: 'chromium-json', testMatch: '**/fallback.spec.ts', use: { browserName: 'chromium', channel: 'chromium' } },
    { name: 'firefox-json', testMatch: '**/fallback.spec.ts', use: { browserName: 'firefox' } },
    { name: 'webkit-json', testMatch: '**/fallback.spec.ts', use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
})
