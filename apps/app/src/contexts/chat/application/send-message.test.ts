import { describe, expect, it } from "vite-plus/test"
import { SendMessage } from "@/contexts/chat/application/send-message"
import type { Member } from "@/contexts/membership/domain/member"

const member: Member = {
  id: "member",
  email: "member@example.com",
  name: "Member",
  role: "member",
  status: "active",
  createdAt: 0,
}

describe("sending messages", () => {
  it("rejects inactive members and missing channels before persistence", async () => {
    const writes: unknown[] = []
    const send = new SendMessage({
      principal: { memberId: member.id, sessionHash: "test", kind: "browser" },
      channels: { findOne: async () => null },
      messages: {
        create: async (message) => {
          writes.push(message)
          return message
        },
      },
    })
    expect(
      await send.execute(
        { ...member, status: "disabled" },
        { id: crypto.randomUUID(), channelId: "general", text: "hello" },
      ),
    ).toBeInstanceOf(Error)
    expect(
      await send.execute(member, { id: crypto.randomUUID(), channelId: "missing", text: "hello" }),
    ).toBeInstanceOf(Error)
    expect(writes).toHaveLength(0)
  })
  it("normalizes valid messages and rejects empty or oversized bodies", async () => {
    const send = new SendMessage({
      principal: { memberId: member.id, sessionHash: "test", kind: "browser" },
      channels: { findOne: async (id) => ({ id, name: "general", archived: false }) },
      messages: { create: async (message) => message },
    })
    expect(
      await send.execute(member, {
        id: crypto.randomUUID(),
        channelId: "general",
        text: "  hello  ",
      }),
    ).toMatchObject({ text: "hello", memberId: member.id })
    expect(
      await send.execute(member, { id: crypto.randomUUID(), channelId: "general", text: "   " }),
    ).toBeInstanceOf(Error)
    expect(
      await send.execute(member, {
        id: crypto.randomUUID(),
        channelId: "general",
        text: "x".repeat(4001),
      }),
    ).toBeInstanceOf(Error)
  })
})
