import { it, expect } from "vite-plus/test"
import { InviteMember } from "@/contexts/membership/application/invite-member"
import { InvitationFailed } from "@/contexts/membership/domain/invitation-failed"
import type { Member } from "@/contexts/membership/domain/member"

it("rejects non-managers before recording any invitation intent", async () => {
  const writes: string[] = []
  const useCase = new InviteMember({
    invitations: {
      create: async () => {
        writes.push("create")
        return new InvitationFailed("forbidden")
      },
    },
  })
  const actor: Member = {
    id: "actor",
    name: "Actor",
    email: "actor@example.com",
    status: "active",
    role: "member",
    createdAt: 0,
  }
  for (const member of [actor, { ...actor, role: "admin" as const, status: "disabled" as const }]) {
    expect(
      await useCase.execute(member, {
        id: "id",
        hash: "hash",
        email: "guest@example.com",
        expiresAt: 1,
      }),
    ).toMatchObject({ reason: "forbidden" })
  }
  expect(writes).toEqual([])
})
