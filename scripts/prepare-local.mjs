import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { packageBin } from "./package-bin.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const vp = fileURLToPath(new URL("../node_modules/vite-plus/bin/vp", import.meta.url))
const commands = [
  [fileURLToPath(new URL("./check-lock-age.mjs", import.meta.url))],
  [vp, "pm", "rebuild", "esbuild", "sharp", "workerd", "--", "--ignore-scripts=false"],
]
for (const args of commands) {
  const child = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env })
  if (child.error) throw child.error
  if (child.status !== 0) process.exit(child.status ?? 1)
}
const prepared = spawnSync(process.execPath, [packageBin("apps/app", "void"), "prepare"], {
  cwd: `${root}/apps/app`,
  stdio: "inherit",
})
if (prepared.error) throw prepared.error
process.exitCode = prepared.status ?? 1
