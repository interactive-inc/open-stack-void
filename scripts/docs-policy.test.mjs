import { test } from "node:test"
import assert from "node:assert/strict"
import { inspectDocumentation } from "./docs-policy.mjs"

function fixture() {
  const record = (id, kind, evidence) => ({
    id,
    kind,
    evidence,
    source: "Synthetic user conversation / explicit fixture assumption",
    path: `.docs/${id}.md`,
    status: "current",
    related: [],
    supersedes: [],
    implementation: [],
    verification: [],
  })
  const requirement = record("booking-intent", "requirement", "user")
  const decision = record("booking-cancellation", "decision", "inferred")
  decision.related = [requirement.id]
  decision.implementation = ["apps/app/src/contexts/booking"]
  decision.verification = ["test/booking.spec.ts"]
  return { version: 1, records: [requirement, decision], exceptions: [] }
}
test("a nondeveloper can replace chat with booking while preserving intent, assumption and verification", () => {
  const catalog = fixture()
  const docs = new Map([
    [".docs/booking-intent.md", "User goal: reserve a slot; no payment. [[booking-cancellation]]"],
    [
      ".docs/booking-cancellation.md",
      "Inferred: cancellation before start; ask user before retention. Rejected silent deletion: audit requirement unknown. [[booking-intent]]",
    ],
  ])
  const files = new Set(["apps/app/src/contexts/booking", "test/booking.spec.ts"])
  assert.deepEqual(
    inspectDocumentation(
      catalog,
      docs,
      files,
      {},
      new Set(["apps/app/src/contexts/booking/domain/slot.ts", ".docs/booking-cancellation.md"]),
    ),
    [],
  )
  assert.ok(
    inspectDocumentation(
      catalog,
      docs,
      files,
      {},
      new Set(["apps/app/src/contexts/booking/domain/slot.ts"]),
    ).some((failure) => failure.includes("related current rationale")),
  )
  docs.set(".docs/booking-cancellation.md", "[[missing]] vp run obsolete")
  assert.equal(inspectDocumentation(catalog, docs, files, {}).length, 2)
})
test("missing metadata, missing verification and orphan supersession fail", () => {
  const catalog = fixture()
  catalog.records[0].status = "superseded"
  catalog.records[1].evidence = "assumed-confirmed"
  const docs = new Map(catalog.records.map((record) => [record.path, "intent"]))
  const failures = inspectDocumentation(catalog, docs, new Set(), {})
  assert.ok(failures.some((failure) => failure.includes("missing successor")))
  assert.ok(failures.some((failure) => failure.includes("invalid metadata")))
  assert.ok(failures.some((failure) => failure.includes("missing evidence")))
})
