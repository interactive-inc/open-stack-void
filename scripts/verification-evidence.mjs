const suites = ["test:e2e", "test:e2e:cms", "test:e2e:portless"]
export const releaseSteps = [
  "Secret scan without printing findings",
  "Full isolated verification",
  "Confirm exact clean verification",
]

export function assertFullVerification({ sha, clean, receipt, secretReceipt }) {
  if (!clean || receipt?.sha !== sha || receipt.clean !== true || receipt.full !== true)
    throw new Error("Full verification must match the exact clean commit")
  if (
    !suites.every((suite) =>
      receipt.commands?.some((command) => command[0] === "run" && command[1] === suite),
    )
  )
    throw new Error("Verification evidence must include every browser suite")
  if (secretReceipt?.sha !== sha) throw new Error("Secret scan must match the verified commit")
}

export function assertReleaseRun(run, sha) {
  if (
    !Number.isSafeInteger(run?.id) ||
    run.head_sha !== sha ||
    run.head_branch !== "release" ||
    run.path !== ".github/workflows/verify.yml" ||
    run.event !== "push" ||
    run.status !== "completed" ||
    run.conclusion !== "success"
  )
    throw new Error("The exact release commit needs a successful release verification workflow")
}

export function assertReleaseJob(jobs) {
  const job = jobs.find((candidate) => candidate.name === "verify")
  if (
    job?.conclusion !== "success" ||
    !releaseSteps.every((name) =>
      job.steps?.some((step) => step.name === name && step.conclusion === "success"),
    )
  )
    throw new Error("Release CI must prove full verification, secret scanning and a clean commit")
}
