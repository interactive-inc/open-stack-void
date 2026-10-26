export function releaseCandidate(input) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.version))
    throw new Error("Use a stable major.minor.patch version")
  if (
    !input.clean ||
    input.receipt.sha !== input.sha ||
    !input.receipt.clean ||
    !input.receipt.full
  )
    throw new Error("Full verification of this exact clean SHA is required")
  if (input.secret.sha !== input.sha) throw new Error("Fresh secret scan for this SHA is required")
  if (input.tags.includes(`v${input.version}`)) throw new Error("Version tag already exists")
  return {
    version: input.version,
    sha: input.sha,
    previousTag: input.previousTag,
    changelog: input.commits,
    mode: "dry-run",
    publishAuthorized: false,
    rollback: {
      code: "Redeploy the previously verified artifact only after explicit authorization.",
      data: "Confirm migration compatibility and a valid database restore point; never infer data rollback from a Git revert.",
      readiness: "not-verified",
      previousTag: input.previousTag,
    },
  }
}
