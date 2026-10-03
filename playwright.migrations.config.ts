import { defineConfig } from '@playwright/test'
import browserConfig from './playwright.config'

export default defineConfig({
  ...browserConfig,
  outputDir: 'test-results/migrations',
  reporter: [['list'], ['json', { outputFile: 'test-results/migration-results.json' }]],
  projects: [
    { name: 'chromium-migrations', testMatch: '**/historical-migration.spec.ts', use: { browserName: 'chromium', channel: 'chromium' } },
  ],
})
