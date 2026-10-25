import { defineConfig } from "vite"
import { voidPlugin } from "void"
import { voidReact } from "@void/react/plugin"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"

export default defineConfig({
  server: {
    allowedHosts: ["app.void.stack.localhost"],
    cors: { origin: /^http:\/\/app\.void\.stack\.localhost$/ },
    strictPort: true,
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@tanstack/react-query",
      "@simplewebauthn/browser",
      "@base-ui/react/alert-dialog",
      "@base-ui/react/avatar",
      "@base-ui/react/button",
      "@base-ui/react/dialog",
      "@base-ui/react/input",
      "@base-ui/react/separator",
      "@base-ui/react/tooltip",
      "@base-ui/react/merge-props",
      "@base-ui/react/use-render",
      "@shadcn/react/message-scroller",
      "@hugeicons/react",
      "@hugeicons/core-free-icons",
      "class-variance-authority",
      "cn",
      "zod",
    ],
  },
  environments: {
    void_worker: {
      optimizeDeps: {
        include: [
          "hono",
          "hono/body-limit",
          "hono/cookie",
          "hono/factory",
          "@simplewebauthn/server",
        ],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@app": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  plugins: [
    voidPlugin({ persistTo: process.env.VOID_CHAT_TEST_STATE ?? ".void" }),
    voidReact({ react: { compiler: true } }),
    tailwindcss(),
  ],
})
