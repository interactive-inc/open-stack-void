import { describe, expect, it } from "vite-plus/test"
import { RenameProfile } from "@/contexts/membership/application/rename-profile"
import { ProfileUpdateFailed } from "@/contexts/membership/domain/profile-update-failed"
import type { Member } from "@/contexts/membership/domain/member"

const member: Member = {
  id: "self",
  name: "Before",
  email: "member@example.com",
  role: "member",
  status: "active",
  createdAt: 0,
}

describe("renaming one's own profile", () => {
  it("rejects disabled and invalid names without persistence", async () => {
    const writes: string[] = []
    const rename = new RenameProfile({
      members: {
        renameProfile: async (id) => {
          writes.push(id)
          return member
        },
      },
    })
    expect(await rename.execute({ ...member, status: "disabled" }, "New")).toMatchObject({
      reason: "inactive",
    })
    for (const name of ["  ", "x".repeat(81)])
      expect(await rename.execute(member, name)).toMatchObject({ reason: "invalid-name" })
    expect(writes).toHaveLength(0)
  })
  it("targets only the actor, preserves role and handles a concurrent disable", async () => {
    const writes: unknown[] = []
    const rename = new RenameProfile({
      members: {
        renameProfile: async (id, name) => {
          writes.push({ id, name })
          return { ...member, name }
        },
      },
    })
    expect(await rename.execute(member, "  New Name  ")).toMatchObject({
      id: member.id,
      name: "New Name",
      role: "member",
    })
    expect(writes).toEqual([{ id: "self", name: "New Name" }])
    const disabled = new RenameProfile({ members: { renameProfile: async () => null } })
    expect(await disabled.execute(member, "New")).toBeInstanceOf(ProfileUpdateFailed)
  })
})
