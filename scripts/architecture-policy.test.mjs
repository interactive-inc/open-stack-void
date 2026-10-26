import { test } from "node:test"
import assert from "node:assert/strict"
import { inspectArchitecture } from "./architecture-policy.mjs"

test("new contexts retain the layout and clients cannot import database bindings", () => {
  assert.ok(inspectArchitecture("apps/app/src/contexts/booking/service.ts", "").length)
  assert.ok(inspectArchitecture("apps/cli/src/read.ts", 'import { db } from "void/db"').length)
  assert.deepEqual(
    inspectArchitecture("apps/app/src/contexts/booking/domain/slot.ts", 'import { z } from "zod"'),
    [],
  )
})

test("domain rejects framework imports, re-exports and type-only infrastructure", () => {
  for (const source of [
    'import { x } from "void/db"',
    'export * from "hono"',
    'import type { X } from "@/contexts/chat/infrastructure/x"',
  ])
    assert.ok(
      inspectArchitecture("apps/app/src/contexts/chat/domain/x.ts", source).includes(
        "domain dependency",
      ),
    )
})
test("application allows explicit type dependencies but rejects runtime and cross-context writes", () => {
  const path = "apps/app/src/contexts/chat/application/x.ts"
  assert.deepEqual(
    inspectArchitecture(path, 'import type { X } from "@/contexts/chat/infrastructure/x"'),
    [],
  )
  assert.ok(
    inspectArchitecture(path, 'import { X } from "@/contexts/chat/infrastructure/x"').length,
  )
  assert.ok(
    inspectArchitecture(path, 'export { X } from "@/contexts/identity/application/x"').length,
  )
  assert.ok(inspectArchitecture(path, 'const x = import("void/db")').includes("dynamic import"))
})
