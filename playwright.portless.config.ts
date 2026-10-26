import { defineConfig } from "@playwright/test"

const state = `../../.local/portless-e2e-${Date.now()}`

export default defineConfig({
  testDir: "./test",
  testMatch: "portless.spec.ts",
  timeout: 120_000,
  workers: 1,
  outputDir: ".local/portless-test-results",
  reporter: "list",
  use: { channel: "chrome", baseURL: "http://app.void.stack.localhost" },
  webServer: {
    command: "vp run dev",
    url: "http://127.0.0.1:4321/",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
      VOID_CHAT_TEST_STATE: `${state}/app`,
      VOID_SITE_TEST_STATE: `${state}/site`,
      APP_ORIGIN: "http://app.void.stack.localhost",
      BOOTSTRAP_TOKEN: "portless-e2e-only-key",
      ADMIN_EMAIL: "portless-test@example.com",
      VOID_TEST_DIAGNOSTICS: "1",
    },
  },
})
