import { spawn } from "node:child_process"
import { packageBin } from "./package-bin.mjs"

const app = process.argv[2]
if (!["app", "site"].includes(app)) throw new Error("Unknown development app")
const cli = packageBin(process.cwd(), app === "app" ? "vite" : "astro")
const environment = { ...process.env }
delete environment.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS
const child = spawn(
  process.execPath,
  [cli, "dev", "--host", "127.0.0.1", "--port", process.env.PORT],
  {
    stdio: "inherit",
    env: environment,
  },
)
child.on("exit", (code) => {
  process.exitCode = code ?? 1
})
