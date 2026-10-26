import { it, expect } from "vite-plus/test"
import { DisableMember } from "@/contexts/membership/application/disable-member"
import { RestoreMember } from "@/contexts/membership/application/restore-member"
import { ChangeMemberRole } from "@/contexts/membership/application/change-member-role"
import type { Member } from "@/contexts/membership/domain/member"

const actor: Member = {
  id: "admin",
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  status: "active",
  createdAt: 0,
}
const target: Member = { ...actor, id: "target", role: "member" }

it("passes current actor to guarded writes and reports concurrent authority changes", async () => {
  const calls: unknown[] = []
  const members = {
    findOne: async () => target,
    setStatus: async (actorId: string, targetId: string, status: "active" | "disabled") => {
      calls.push({ actorId, targetId, status })
      return null
    },
  }
  expect(await new DisableMember({ members }).execute(actor, target.id)).toMatchObject({
    reason: "changed",
  })
  expect(await new RestoreMember({ members }).execute(actor, target.id)).toMatchObject({
    reason: "changed",
  })
  expect(calls).toEqual([
    { actorId: actor.id, targetId: target.id, status: "disabled" },
    { actorId: actor.id, targetId: target.id, status: "active" },
  ])
  const roles = { findOne: async () => target, changeRole: async () => null }
  expect(
    await new ChangeMemberRole({ members: roles }).execute(actor, target.id, "admin"),
  ).toMatchObject({ reason: "forbidden" })
  expect(
    await new ChangeMemberRole({ members: roles }).execute(
      { ...actor, role: "owner" },
      target.id,
      "admin",
    ),
  ).toMatchObject({ reason: "changed" })
})
