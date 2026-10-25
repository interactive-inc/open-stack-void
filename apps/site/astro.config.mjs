import { fileURLToPath } from "node:url"
import cloudflare from "@astrojs/cloudflare"
import react from "@astrojs/react"
import { d1, r2 } from "@emdash-cms/cloudflare"
import { defineConfig } from "astro/config"
import emdash from "emdash/astro"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["void.stack.localhost"],
      cors: { origin: /^http:\/\/void\.stack\.localhost$/ },
      strictPort: true,
    },
  },
  output: "server",
  adapter: cloudflare({
    persistState: process.env.VOID_SITE_TEST_STATE
      ? { path: process.env.VOID_SITE_TEST_STATE }
      : true,
  }),
  image: {
    layout: "constrained",
    responsiveStyles: true,
  },
  integrations: [
    {
      name: "local-sample-seed",
      hooks: {
        "astro:config:setup": ({ injectRoute, command }) => {
          if (command === "dev")
            injectRoute({
              pattern: "/_emdash/api/setup/local-seed",
              entrypoint: fileURLToPath(new URL("./src/endpoints/local-seed.ts", import.meta.url)),
            })
        },
      },
    },
    react(),
    emdash({
      siteUrl: process.env.PORTLESS_URL,
      database: d1({ binding: "DB", session: "auto", coalesce: true }),
      storage: r2({ binding: "MEDIA" }),
    }),
  ],
  devToolbar: { enabled: false },
})
