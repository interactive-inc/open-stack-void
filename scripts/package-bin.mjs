import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { existsSync, readFileSync } from "node:fs"

/** Resolve a CLI through its workspace, regardless of package-manager hoisting. */
export function packageBin(project, name) {
  const require = createRequire(resolve(project, "package.json"))
  const entry = require.resolve(name)
  if (name === "vite") return resolve(dirname(entry), "cli.js")
  let directory = dirname(entry)
  while (true) {
    const file = resolve(directory, "package.json")
    if (existsSync(file)) {
      const manifest = JSON.parse(readFileSync(file, "utf8"))
      const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[name]
      if (bin) return resolve(directory, bin)
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`No executable for ${name}`)
    directory = parent
  }
}
