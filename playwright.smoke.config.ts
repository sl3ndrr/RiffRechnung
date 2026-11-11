import { defineConfig } from '@playwright/test'
import browserConfig from './playwright.config'

export default defineConfig({
  ...browserConfig,
  projects: [
    { name: 'chromium-smoke', testMatch: '**/build-smoke.spec.ts', use: { browserName: 'chromium', channel: 'chromium' } },
  ],
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
  use: { ...browserConfig.use, baseURL: 'http://127.0.0.1:4174' },
})
