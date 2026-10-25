import { defineEnv, string } from "void/env"

export default defineEnv({
  APP_ORIGIN: string().default("http://app.void.stack.localhost"),
  BOOTSTRAP_TOKEN: string().optional(),
  ADMIN_EMAIL: string().default("owner@example.com"),
})
