import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { inspectArchitecture } from "./architecture-policy.mjs"

const paths = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean)
const failures = []
for (const path of new Set(paths)) {
  if (
    path.startsWith("apps/app/src/") &&
    path !== "apps/app/src/vite-env.d.ts" &&
    !/^apps\/app\/src\/(api|client|components|contexts|hooks|lib|screens|styles)\//.test(path)
  )
    failures.push(`${path}: unapproved source directory`)
  if (/^(apps|packages)\//.test(path) && !/^(apps\/(app|site|cli|mcp)|packages\/sdk)\//.test(path))
    failures.push(`${path}: unapproved workspace`)
  if (!/\.tsx?$/.test(path)) continue
  for (const rule of inspectArchitecture(path, readFileSync(path, "utf8")))
    failures.push(`${path}: ${rule}`)
}
for (const name of ["workflow", "architecture", "verification", "delivery", "conversation"]) {
  const path = `.docs/core/${name}.md`
  if (!readFileSync("AGENTS.md", "utf8").includes(path))
    failures.push(`AGENTS.md must require ${path}`)
  readFileSync(path, "utf8")
}
if (failures.length) throw new Error(failures.join("\n"))
console.log("Architecture and core instruction links passed")
