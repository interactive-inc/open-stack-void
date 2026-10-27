import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./test",
  testMatch: "site-content.spec.ts",
  timeout: 180_000,
  workers: 1,
  outputDir: ".local/cms-test-results",
  reporter: "list",
  use: {
    actionTimeout: 15000,
    channel: "chrome",
    locale: "ja-JP",
    baseURL: "http://localhost:4322",
  },
  webServer: [
    {
      command: "vp -C apps/app dev --host 127.0.0.1 --port 5184 --strictPort",
      url: "http://localhost:5184/api/health",
      reuseExistingServer: false,
      timeout: 90000,
      env: {
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
        VOID_CHAT_TEST_STATE: `../../.local/cms-app-e2e-${Date.now()}`,
        APP_ORIGIN: "http://localhost:5184",
        BOOTSTRAP_TOKEN: "cms-e2e-only-key",
        ADMIN_EMAIL: "cms-test@example.com",
      },
    },
    {
      command: "vp -C apps/site exec astro dev --host 127.0.0.1 --port 4322 --ignore-lock",
      url: "http://localhost:4322",
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        VOID_SITE_TEST_STATE: `../../.local/cms-e2e-${Date.now()}`,
        PUBLIC_APP_URL: "http://localhost:5184",
      },
    },
  ],
})
