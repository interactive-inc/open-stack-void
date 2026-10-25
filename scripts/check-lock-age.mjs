import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { assertReleaseAge } from "./release-policy.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const lock = JSON.parse(readFileSync(`${root}/package-lock.json`, "utf8"))
const packages = new Map()
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || ["apps/app", "apps/site", "apps/cli", "apps/mcp", "packages/sdk"].includes(path))
    continue
  if (entry.link) {
    if (!["apps/app", "apps/site", "apps/cli", "apps/mcp", "packages/sdk"].includes(entry.resolved))
      throw new Error(`Unapproved workspace link: ${path}`)
    continue
  }
  const parent = lock.packages[path.slice(0, path.lastIndexOf("/node_modules/"))]
  const artifact = entry.inBundle ? parent : entry
  if (!artifact?.resolved || !artifact.integrity)
    throw new Error(`Missing registry integrity: ${path}`)
  const url = new URL(artifact.resolved)
  if (url.origin !== "https://registry.npmjs.org" || !url.pathname.includes("/-/"))
    throw new Error(`Non-registry dependency: ${path}`)
  const name = entry.inBundle
    ? path.split("node_modules/").at(-1)
    : decodeURIComponent(url.pathname.split("/-/")[0].slice(1))
  if (!packages.has(name)) packages.set(name, new Set())
  packages.get(name).add(entry.version)
}
const cache = `${root}/.local/release-metadata`
mkdirSync(cache, { recursive: true })
const pending = packages.entries()
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (const [name, versions] of pending) {
      const path = `${cache}/${createHash("sha256").update(name).digest("hex")}.json`
      let metadata = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null
      if (!metadata || [...versions].some((version) => !metadata.time?.[version])) {
        const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: "application/json" },
        })
        if (!response.ok)
          throw new Error(`Release metadata unavailable: ${name} (${response.status})`)
        const packument = await response.json()
        metadata = { time: packument.time }
        writeFileSync(path, JSON.stringify(metadata))
      }
      for (const version of versions) assertReleaseAge(name, version, metadata.time?.[version])
    }
  }),
)
console.log(`Release-age policy verified ${packages.size} registry packages (24h, no exceptions)`)
