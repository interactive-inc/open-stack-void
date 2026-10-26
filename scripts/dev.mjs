import { readFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { assertProxyPort } from "./assert-proxy-port.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const cli = fileURLToPath(new URL("../node_modules/portless/dist/cli.js", import.meta.url))
const config = JSON.parse(readFileSync(new URL("../portless.json", import.meta.url), "utf8"))
const targets = process.argv[2] ? [process.argv[2]] : ["app", "site"]
await assertProxyPort(80)
for (const target of targets)
  if (!["app", "site"].includes(target)) throw new Error("Unknown development app")
for (const app of targets) {
  const child = spawn(
    process.execPath,
    [
      cli,
      config.apps[`apps/${app}`].name,
      "--app-port",
      String(config.apps[`apps/${app}`].appPort),
      "node",
      "../../scripts/serve.mjs",
      app,
    ],
    {
      cwd: `${root}/apps/${app}`,
      stdio: "inherit",
      env: {
        ...process.env,
        PORTLESS_STATE_DIR: fileURLToPath(new URL("../.local/portless", import.meta.url)),
        PORTLESS_PORT: "80",
        PORTLESS_HTTPS: "0",
        PORTLESS_LAN: "0",
        PORTLESS_SYNC_HOSTS: "0",
        PORTLESS_WILDCARD: "0",
        PORTLESS_TLD: "localhost",
        PORTLESS: "1",
        PORTLESS_TAILSCALE: "0",
        PORTLESS_FUNNEL: "0",
        PORTLESS_NGROK: "0",
        PORTLESS_CLOUDFLARE: "0",
        PUBLIC_APP_URL: "http://app.void.stack.localhost",
      },
    },
  )
  child.on("exit", (code) => {
    process.exitCode = code ?? 1
  })
  const port = config.apps[`apps/${app}`].appPort
  const path = app === "app" ? "/api/health" : "/"
  const deadline = Date.now() + 90_000
  while (true) {
    if (child.exitCode !== null) throw new Error(`${app} exited before becoming ready`)
    const ready = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(1000),
    })
      .then((response) => response.ok)
      .catch(() => false)
    if (ready) break
    if (Date.now() > deadline) throw new Error(`${app} did not become ready`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}
