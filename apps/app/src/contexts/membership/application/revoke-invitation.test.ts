import { it, expect } from "vite-plus/test"
import { RevokeInvitation } from "@/contexts/membership/application/revoke-invitation"
import type { Member } from "@/contexts/membership/domain/member"

const actor: Member = {
  id: "admin",
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  status: "active",
  createdAt: 0,
}

it("rejects inactive/non-admin actors before writes and handles authority lost during the request", async () => {
  const calls: string[] = []
  const revoke = new RevokeInvitation({
    invitations: {
      revoke: async (id) => {
        calls.push(id)
        return false
      },
    },
  })
  expect(await revoke.execute({ ...actor, role: "member" }, "invite")).toMatchObject({
    reason: "forbidden",
  })
  expect(await revoke.execute({ ...actor, status: "disabled" }, "invite")).toMatchObject({
    reason: "forbidden",
  })
  expect(calls).toHaveLength(0)
  expect(await revoke.execute(actor, "invite")).toMatchObject({ reason: "forbidden" })
  const allowed = new RevokeInvitation({ invitations: { revoke: async () => true } })
  expect(await allowed.execute(actor, "missing-or-revoked")).toEqual({ ok: true })
})
