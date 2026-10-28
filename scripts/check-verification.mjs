import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { assertFullVerification } from "./verification-evidence.mjs"

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()
const sha = git("rev-parse", "HEAD")
if (process.env.GITHUB_ACTIONS === "true" && sha !== process.env.GITHUB_SHA)
  throw new Error("CI checkout must match the workflow commit")
assertFullVerification({
  sha,
  clean: !git("status", "--porcelain"),
  receipt: JSON.parse(readFileSync(".local/verification.json", "utf8")),
  secretReceipt: JSON.parse(readFileSync(".local/secret-receipt.json", "utf8")),
})
console.log(`Exact clean commit verification confirmed: ${sha}`)
