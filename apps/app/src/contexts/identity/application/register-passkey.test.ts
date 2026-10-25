import { describe, expect, it } from "vite-plus/test"
import { RegisterPasskey } from "@/contexts/identity/application/register-passkey"
import type { RegistrationClaim } from "@/contexts/identity/domain/registration-claim"

const claim: RegistrationClaim = {
  id: "member",
  email: "member@example.com",
  name: "Member",
  role: "member",
  existing: false,
  inviteHash: "invitation",
  sessionHash: null,
}
const credential = { id: "credential", publicKey: "public-key", counter: 0 }

describe("passkey registration", () => {
  it("does not issue a session when registration was expired or consumed concurrently", async () => {
    const sessions: string[] = []
    const registration = new RegisterPasskey({
      registrations: { create: async () => new Error("Already consumed") },
      sessions: {
        create: async (id) => {
          sessions.push(id)
          return { token: "secret", hash: "hash", expiresAt: 0 }
        },
      },
    })

    expect(await registration.execute(claim, credential)).toBeInstanceOf(Error)
    expect(sessions).toEqual([])
  })

  it("issues a session for the registered identity after successful persistence", async () => {
    const registrations: string[] = []
    const registration = new RegisterPasskey({
      registrations: {
        create: async (identity) => {
          registrations.push(identity.id)
          return null
        },
      },
      sessions: { create: async (id) => ({ token: id, hash: "hash", expiresAt: 0 }) },
    })

    expect(await registration.execute(claim, credential)).toMatchObject({ token: claim.id })
    expect(registrations).toEqual([claim.id])
  })
})
