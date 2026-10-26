import { describe, it, expect } from "vite-plus/test"
import { CreateChannel } from "@/contexts/chat/application/create-channel"
import { RenameChannel } from "@/contexts/chat/application/rename-channel"
import { SetChannelArchive } from "@/contexts/chat/application/set-channel-archive"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { Member } from "@/contexts/membership/domain/member"

const actor: Member = {
  id: "actor",
  name: "Actor",
  email: "actor@example.com",
  status: "active",
  role: "owner",
  createdAt: 0,
}
const principal = { memberId: actor.id, sessionHash: "synthetic", kind: "browser" }
describe("public channel management", () => {
  it("allows active managers and rejects members, disabled actors and mismatched identities without writes", async () => {
    const writes: unknown[] = []
    const channel = { id: "channel", name: "general", archived: false }
    const repository = {
      create: async () => {
        writes.push("create")
        return channel
      },
      rename: async () => {
        writes.push("rename")
        return channel
      },
      setArchived: async () => {
        writes.push("archive")
        return channel
      },
    }
    const operations = [
      (member: Member) =>
        new CreateChannel(repository).execute(member, principal, {
          id: channel.id,
          name: channel.name,
        }),
      (member: Member) =>
        new RenameChannel(repository).execute(member, principal, channel.id, "renamed"),
      (member: Member) =>
        new SetChannelArchive(repository).execute(member, principal, channel.id, true),
      (member: Member) =>
        new SetChannelArchive(repository).execute(member, principal, channel.id, false),
    ]
    for (const operation of operations) {
      for (const denied of [
        { ...actor, role: "member" as const },
        { ...actor, status: "disabled" as const },
        { ...actor, id: "other" },
      ])
        expect(await operation(denied)).toBeInstanceOf(ChatFailed)
    }
    expect(writes).toHaveLength(0)
    for (const operation of operations) {
      expect(await operation(actor)).toEqual(channel)
      expect(await operation({ ...actor, role: "admin" })).toEqual(channel)
    }
    expect(writes).toHaveLength(8)
  })
  it("normalizes names and refuses invalid names before persistence", async () => {
    const names: string[] = []
    const create = new CreateChannel({
      create: async (_, input) => {
        names.push(input.name)
        return { ...input, archived: false }
      },
    })
    const rename = new RenameChannel({
      rename: async (_, id, name) => {
        names.push(name)
        return { id, name, archived: false }
      },
    })
    for (const name of ["", "Upper", "with space", "-bad", "x".repeat(41)]) {
      expect(await create.execute(actor, principal, { id: "id", name })).toBeInstanceOf(ChatFailed)
      expect(await rename.execute(actor, principal, "id", name)).toBeInstanceOf(ChatFailed)
    }
    expect(names).toEqual([])
    await create.execute(actor, principal, { id: "id", name: " general " })
    await rename.execute(actor, principal, "id", " renamed ")
    expect(names).toEqual(["general", "renamed"])
  })
})
