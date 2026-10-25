import { describe, it, expect } from "vite-plus/test"
import { InviteMember } from "@/contexts/membership/application/invite-member"
import type { Member } from "@/contexts/membership/domain/member"

const actor: Member = {
  id: "owner",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
  status: "active",
  createdAt: 0,
}
const invitation = {
  id: "invitation",
  hash: "hash",
  email: "member@example.com",
  expiresAt: 100,
  link: "http://localhost/#invite=token",
}

describe("invitations", () => {
  it("does not persist or send when authority is missing", async () => {
    const writes: string[] = []
    const invite = new InviteMember({
      invitations: {
        create: async (value) => {
          writes.push(value.id)
          return value
        },
        delete: async (id) => {
          writes.push(id)
        },
      },
      mail: {
        send: async () => {
          writes.push("mail")
          return null
        },
      },
    })
    expect(await invite.execute({ ...actor, role: "member" }, invitation)).toBeInstanceOf(Error)
    expect(writes).toEqual([])
  })
  it("revokes an undelivered invitation so failed sends do not grant access", async () => {
    const actions: string[] = []
    const invite = new InviteMember({
      invitations: {
        create: async (value) => {
          actions.push("created")
          return value
        },
        delete: async () => {
          actions.push("revoked")
        },
      },
      mail: { send: async () => new Error("Delivery failed") },
    })
    expect(await invite.execute(actor, invitation)).toBeInstanceOf(Error)
    expect(actions).toEqual(["created", "revoked"])
  })
})
