import { describe, it, expect } from "vite-plus/test"
import { InviteMember } from "@/contexts/membership/application/invite-member"
import type { Member } from "@/contexts/membership/domain/member"
import { InvitationFailed } from "@/contexts/membership/domain/invitation-failed"

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
  it("does not resend after a repeated request or repository rejection", async () => {
    const sent: string[] = []
    const invite = new InviteMember({
      invitations: {
        create: async (value) => ({
          created: false,
          invitation: {
            id: value.id,
            email: value.email,
            expiresAt: value.expiresAt,
            status: "pending",
          },
        }),
        revokeUndelivered: async () => {},
      },
      mail: {
        send: async () => {
          sent.push("mail")
          return null
        },
      },
    })
    expect(await invite.execute(actor, invitation)).toMatchObject({ id: invitation.id })
    expect(sent).toHaveLength(0)
    const changed = new InviteMember({
      invitations: {
        create: async () => new InvitationFailed("forbidden"),
        revokeUndelivered: async () => {},
      },
      mail: {
        send: async () => {
          sent.push("unexpected")
          return null
        },
      },
    })
    expect(await changed.execute(actor, invitation)).toMatchObject({ reason: "forbidden" })
    expect(sent).toHaveLength(0)
  })
  it("sanitizes thrown provider failures and revokes the pending link", async () => {
    const revoked: string[] = []
    const invite = new InviteMember({
      invitations: {
        create: async (value) => ({
          created: true,
          invitation: {
            id: value.id,
            email: value.email,
            expiresAt: value.expiresAt,
            status: "pending",
          },
        }),
        revokeUndelivered: async (id) => {
          revoked.push(id)
        },
      },
      mail: {
        send: async () => {
          throw new Error("Provider diagnostics must stay private")
        },
      },
    })
    const failure = await invite.execute(actor, invitation)
    expect(failure).toMatchObject({ reason: "delivery" })
    if (failure instanceof Error) expect(failure.message).not.toContain("Provider diagnostics")
    expect(revoked).toEqual([invitation.id])
  })
  it("does not persist or send when authority is missing", async () => {
    const writes: string[] = []
    const invite = new InviteMember({
      invitations: {
        create: async (value) => {
          writes.push(value.id)
          return {
            created: true,
            invitation: {
              id: value.id,
              email: value.email,
              expiresAt: value.expiresAt,
              status: "pending",
            },
          }
        },
        revokeUndelivered: async (id) => {
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
          return {
            created: true,
            invitation: {
              id: value.id,
              email: value.email,
              expiresAt: value.expiresAt,
              status: "pending",
            },
          }
        },
        revokeUndelivered: async () => {
          actions.push("revoked")
        },
      },
      mail: { send: async () => new Error("Delivery failed") },
    })
    expect(await invite.execute(actor, invitation)).toBeInstanceOf(Error)
    expect(actions).toEqual(["created", "revoked"])
  })
})
