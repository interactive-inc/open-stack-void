import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const repository = "interactive-inc/open-stack-void"
const read = (command, args) => execFileSync(command, args, { encoding: "utf8" }).trim()
const api = (path) => JSON.parse(read("gh", ["api", `repos/${repository}/${path}`]))
const sha = read("git", ["rev-parse", "HEAD"])
function assertTarget() {
  if (read("git", ["branch", "--show-current"]) !== "release")
    throw new Error("Deploy only from the release branch")
  if (read("git", ["status", "--porcelain"])) throw new Error("Release checkout must be clean")
  if (api("git/ref/heads/release").object.sha !== sha)
    throw new Error("Checkout must match the current remote release commit")
  const protection = api("branches/release/protection")
  if (
    !protection.enforce_admins?.enabled ||
    !protection.required_status_checks?.strict ||
    !protection.required_status_checks.contexts.includes("verify") ||
    !protection.required_pull_request_reviews ||
    protection.allow_force_pushes?.enabled ||
    protection.allow_deletions?.enabled
  )
    throw new Error("Release branch protections are incomplete")
  const checks = api(`commits/${sha}/check-runs`).check_runs
  const verification = checks.find(
    (check) => check.name === "verify" && check.app?.slug === "github-actions",
  )
  if (verification?.status !== "completed" || verification.conclusion !== "success")
    throw new Error("The exact release commit needs a successful GitHub verify check")
}
const vp = fileURLToPath(new URL("../node_modules/vite-plus/bin/vp", import.meta.url))
function run(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [vp, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: "9acefc4e7cfd25ff42cf1213f469f775",
      ...extraEnv,
    },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Production release stopped: vp ${args.join(" ")}`)
}
assertTarget()
run(["run", "verify:full"])
run(["run", "check:secrets"])
const verification = JSON.parse(readFileSync(".local/verification.json", "utf8"))
const secrets = JSON.parse(readFileSync(".local/secret-receipt.json", "utf8"))
if (verification.sha !== sha || !verification.clean || !verification.full || secrets.sha !== sha)
  throw new Error("Verification receipts must match the exact clean release commit")
// Recheck GitHub and the checkout after the lengthy verification, before any production write.
assertTarget()
console.log(`Deploying verified release ${sha}`)
run(["-C", "apps/app", "exec", "void", "deploy", "--platform", "cloudflare"], {
  TSX_TSCONFIG_PATH: fileURLToPath(new URL("../apps/app/tsconfig.json", import.meta.url)),
})
assertTarget()
run(["-C", "apps/site", "run", "deploy"], {
  PUBLIC_APP_URL: "https://app.stack.open.inta.site",
  PORTLESS_URL: "https://stack.open.inta.site",
})
console.log(`Published app and site from ${sha}; verify production HTTP behavior separately`)
