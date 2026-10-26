import { test } from "node:test"
import assert from "node:assert/strict"
import { releaseCandidate } from "./release-candidate.mjs"

const input = {
  version: "0.1.0",
  sha: "a".repeat(40),
  clean: true,
  receipt: { sha: "a".repeat(40), clean: true, full: true },
  secret: { sha: "a".repeat(40) },
  tags: [],
  previousTag: null,
  commits: ["feat: example"],
}
test("candidate remains a dry run with explicit unverified data rollback", () => {
  const candidate = releaseCandidate(input)
  assert.equal(candidate.publishAuthorized, false)
  assert.equal(candidate.mode, "dry-run")
  assert.equal(candidate.rollback.readiness, "not-verified")
})
test("dirty, stale, partial and duplicate releases fail closed", () => {
  for (const patch of [
    { clean: false },
    { receipt: { ...input.receipt, full: false } },
    { receipt: { ...input.receipt, sha: "b".repeat(40) } },
    { secret: { sha: "old" } },
    { tags: ["v0.1.0"] },
    { version: "v0.1.0;deploy" },
  ])
    assert.throws(() => releaseCandidate({ ...input, ...patch }))
})
