import { defineConfig, devices } from '@playwright/test'

const reuse = !process.env.CI

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Every scenario owns a WebGL context; keep the shared graphics device uncontended.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    // The opening sweep is motion; pin the preference so the demo path is stable.
    reducedMotion: 'no-preference',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-iphone', testMatch: ['**/capture.spec.ts', '**/renovation.spec.ts'], use: { ...devices['iPhone 13 Pro'] } },
  ],
  webServer: [
    {
      command: 'node scripts/backend.mjs serve',
      env: { OPENAI_API_KEY: 'intelidar-e2e' },
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: reuse,
      timeout: 30_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: reuse,
      timeout: 30_000,
    },
  ],
})
