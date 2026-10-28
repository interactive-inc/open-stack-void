import test from "node:test"
import assert from "node:assert/strict"
import {
  assertFullVerification,
  assertReleaseRun,
  assertReleaseJob,
  releaseSteps,
} from "./verification-evidence.mjs"

const sha = "a".repeat(40)
const receipt = {
  sha,
  clean: true,
  full: true,
  commands: ["test:e2e", "test:e2e:cms", "test:e2e:portless"].map((suite) => ["run", suite]),
}
const input = { sha, clean: true, receipt, secretReceipt: { sha } }
const run = {
  id: 1,
  head_sha: sha,
  head_branch: "release",
  path: ".github/workflows/verify.yml",
  event: "push",
  status: "completed",
  conclusion: "success",
}
const job = {
  name: "verify",
  conclusion: "success",
  steps: releaseSteps.map((name) => ({ name, conclusion: "success" })),
}

test("CI evidence rejects dirty, stale, partial or missing browser verification", () => {
  assertFullVerification(input)
  for (const patch of [
    { clean: false },
    { receipt: { ...receipt, clean: false } },
    { receipt: { ...receipt, sha: "b".repeat(40) } },
    { receipt: { ...receipt, full: false } },
    { receipt: { ...receipt, commands: receipt.commands.slice(0, 2) } },
    { secretReceipt: { sha: "b".repeat(40) } },
  ])
    assert.throws(() => assertFullVerification({ ...input, ...patch }))
})

test("main, pull request, pending, failed and unrelated workflow runs cannot authorize a release", () => {
  assertReleaseRun(run, sha)
  for (const patch of [
    { head_sha: "b".repeat(40) },
    { head_branch: "main" },
    { path: ".github/workflows/other.yml" },
    { event: "pull_request" },
    { status: "in_progress" },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
  ])
    assert.throws(() => assertReleaseRun({ ...run, ...patch }, sha))
})

test("a successful job cannot authorize publication when a required verification step was skipped", () => {
  assertReleaseJob([job])
  for (const name of releaseSteps) {
    assert.throws(() =>
      assertReleaseJob([{ ...job, steps: job.steps.filter((step) => step.name !== name) }]),
    )
    assert.throws(() =>
      assertReleaseJob([
        {
          ...job,
          steps: job.steps.map((step) =>
            step.name === name ? { ...step, conclusion: "skipped" } : step,
          ),
        },
      ]),
    )
  }
})
