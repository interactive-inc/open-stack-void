import { defineConfig } from "@playwright/test"

const state = `../../.local/app-suite-${Date.now()}`

export default defineConfig({
  testDir: "./test",
  timeout: 120_000,
  workers: 1,
  outputDir: ".local/test-results",
  reporter: "list",
  projects: [
    { name: "journeys", testMatch: "local.spec.ts" },
    { name: "security", testMatch: "authorization.spec.ts", dependencies: ["journeys"] },
    { name: "bootstrap", testMatch: "bootstrap.spec.ts", dependencies: ["security"] },
  ],
  use: {
    actionTimeout: 15_000,
    baseURL: "http://localhost:5183",
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "vp -C apps/app dev --host 127.0.0.1 --port 5183 --strictPort",
      url: "http://localhost:5183/api/health",
      env: {
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
        VOID_CHAT_TEST_STATE: `${state}/app`,
        APP_ORIGIN: "http://localhost:5183",
        BOOTSTRAP_TOKEN: "e2e-only-initialization-key",
        ADMIN_EMAIL: "owner@example.com",
      },
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: "vp -C apps/site exec astro dev --host 127.0.0.1 --port 4322",
      url: "http://localhost:4322",
      env: {
        VOID_SITE_TEST_STATE: `${state}/site`,
        PUBLIC_APP_URL: "http://localhost:5183",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
