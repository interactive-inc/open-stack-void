import { defineConfig } from "vite-plus"

export default defineConfig({
  pack: {
    entry: ["src/server.ts"],
    format: "esm",
    platform: "node",
    dts: false,
    deps: { alwaysBundle: ["@open-stack/sdk"] },
  },
})
