import { readFileSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { inspectDocumentation } from "./docs-policy.mjs"

const paths = [
  ...new Set(
    execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean),
  ),
]
const documents = new Map(
  paths
    .filter((path) => /(?:^|\/)\.docs\/.*\.md$/.test(path))
    .map((path) => [path, readFileSync(path, "utf8")]),
)
const catalog = JSON.parse(readFileSync(".docs/catalog.json", "utf8"))
const files = new Set(paths)
for (const record of catalog.records)
  for (const path of [...record.implementation, ...record.verification]) {
    try {
      if (statSync(path)) files.add(path)
    } catch {
      /* reported by policy */
    }
  }
const changed = new Set(
  execFileSync("git", ["diff", "--name-only", process.env.DOCS_BASE ?? "HEAD"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean),
)
for (const path of execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean))
  changed.add(path)
const failures = inspectDocumentation(
  catalog,
  documents,
  files,
  JSON.parse(readFileSync("package.json", "utf8")).scripts,
  changed,
)
if (failures.length) throw new Error(failures.join("\n"))
console.log(
  `Documentation contracts passed (${documents.size} documents${changed ? ", change impact checked" : ""})`,
)
