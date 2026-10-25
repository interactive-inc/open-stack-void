import { defineConfig } from "vite-plus"

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  pack: {
    entry: ["src/cli.ts"],
    format: "esm",
    platform: "node",
    dts: false,
    deps: { alwaysBundle: ["@open-stack/sdk"] },
  },
})
