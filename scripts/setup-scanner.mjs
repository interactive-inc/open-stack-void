import { mkdirSync, writeFileSync, chmodSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { assertReleaseAge } from "./release-policy.mjs"

assertReleaseAge("gitleaks", "8.30.1", "2026-03-21T02:17:58Z")
const checksums = {
  darwin_arm64: "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
  darwin_x64: "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
  linux_arm64: "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080",
  linux_x64: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
  windows_x64: "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e",
}
const platform = process.platform === "win32" ? "windows" : process.platform
const key = `${platform}_${process.arch}`
if (!checksums[key]) throw new Error("Unsupported scanner platform; no executable was downloaded")
const directory = resolve(".local/tools/gitleaks")
const filename = `gitleaks_8.30.1_${key}.${platform === "windows" ? "zip" : "tar.gz"}`
const response = await fetch(
  `https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/${filename}`,
  { signal: AbortSignal.timeout(60_000) },
)
if (!response.ok) throw new Error(`Scanner download failed (${response.status})`)
const bytes = Buffer.from(await response.arrayBuffer())
if (createHash("sha256").update(bytes).digest("hex") !== checksums[key])
  throw new Error("Scanner checksum mismatch")
mkdirSync(directory, { recursive: true })
const archive = resolve(directory, filename)
writeFileSync(archive, bytes)
execFileSync("tar", ["-xf", archive, "-C", directory], { stdio: "pipe" })
if (platform !== "windows") chmodSync(resolve(directory, "gitleaks"), 0o755)
console.log("Checksum-pinned Gitleaks 8.30.1 prepared inside .local; global settings unchanged")
