import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { releaseCandidate } from "./release-candidate.mjs"

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()
const tags = git("tag", "--merged", "HEAD").split("\n").filter(Boolean)
let previousTag = null
try {
  previousTag = git("describe", "--tags", "--abbrev=0", "HEAD")
} catch {
  /* first candidate */
}
const candidate = releaseCandidate({
  version: process.argv.at(-1),
  sha: git("rev-parse", "HEAD"),
  clean: !git("status", "--porcelain"),
  tags: git("tag").split("\n"),
  previousTag,
  commits: git(
    "log",
    "--format=%h %s",
    ...(previousTag ? [`${previousTag}..HEAD`] : ["HEAD"]),
  ).split("\n"),
  receipt: JSON.parse(readFileSync(".local/verification.json", "utf8")),
  secret: JSON.parse(readFileSync(".local/secret-receipt.json", "utf8")),
})
mkdirSync(".local/release", { recursive: true })
writeFileSync(
  ".local/release/candidate.json",
  JSON.stringify({ ...candidate, reachableTags: tags }, null, 2),
)
writeFileSync(
  ".local/release/CHANGELOG.md",
  `# ${candidate.version} (draft)\n\nSHA: ${candidate.sha}\n\n${candidate.changelog.map((line) => `- ${line}`).join("\n")}\n\nPublication and rollback readiness require review.\n`,
)
console.log(
  `Dry-run release candidate ${candidate.version} for ${candidate.sha}; no tags, releases or deployments created`,
)
