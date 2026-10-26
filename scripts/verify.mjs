import { spawnSync, execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"

const full = process.argv.includes("--full")
mkdirSync(".local", { recursive: true })
rmSync(".local/verification.json", { force: true })
const vp = fileURLToPath(new URL("../node_modules/vite-plus/bin/vp", import.meta.url))
const commands = [
  ["fmt", "--check"],
  ["run", "lint"],
  ["run", "check:architecture"],
  ["run", "check:docs"],
  ["run", "test:harness"],
  ["run", "test:policy"],
  ["run", "test"],
  ["run", "check"],
  ["run", "build"],
  ...(full
    ? [
        ["run", "test:e2e"],
        ["run", "test:e2e:cms"],
        ["run", "test:e2e:portless"],
      ]
    : []),
]
for (const args of commands) {
  const child = spawnSync(process.execPath, [vp, ...args], { stdio: "inherit", env: process.env })
  if (child.error) throw child.error
  if (child.status !== 0) process.exit(child.status ?? 1)
}
const clean = !execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
writeFileSync(
  ".local/verification.json",
  JSON.stringify(
    {
      sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      clean,
      full,
      commands,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
)
console.log(`Verification passed (${full ? "full" : "standard"}; clean=${clean})`)
