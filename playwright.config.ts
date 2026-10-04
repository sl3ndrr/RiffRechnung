import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  // Browser contexts and testInfo artifacts are isolated; keep the expanded
  // three-engine coverage within Quality's existing ten-minute job budget.
  workers: process.env.CI ? 2 : 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173', reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', testIgnore: ['**/fallback.spec.ts', '**/historical-migration.spec.ts'], use: { browserName: 'chromium', channel: 'chromium', colorScheme: 'light' } },
    { name: 'chromium-dark-a11y', testMatch: '**/accessibility.spec.ts', use: { browserName: 'chromium', channel: 'chromium', colorScheme: 'dark' } },
    { name: 'firefox-theme', testMatch: ['**/theme.spec.ts', '**/motion.spec.ts'], use: { browserName: 'firefox' } },
    { name: 'webkit-theme', testMatch: ['**/theme.spec.ts', '**/motion.spec.ts'], timeout: 60_000, use: { browserName: 'webkit', actionTimeout: 10_000 } },
    { name: 'chromium-json', testMatch: '**/fallback.spec.ts', use: { browserName: 'chromium', channel: 'chromium' } },
    { name: 'firefox-json', testMatch: '**/fallback.spec.ts', use: { browserName: 'firefox' } },
    // Fixture setup consumed ~24s of the former 30s budget in CI 34385945859.
    // Keep all assertions (default 5s) and bound individual UI actions to 10s.
    { name: 'webkit-json', testMatch: '**/fallback.spec.ts', timeout: 60_000, use: { browserName: 'webkit', actionTimeout: 10_000 } },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
})
