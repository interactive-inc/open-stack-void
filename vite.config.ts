import { defineConfig } from "vite-plus"

export default defineConfig({
  fmt: { semi: false },
  run: {
    tasks: {
      "app:dev": { command: "node scripts/dev.mjs app", cache: false },
      "site:dev": { command: "node scripts/dev.mjs site", cache: false },
    },
  },
})
