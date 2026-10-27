import { describe, expect, it } from "vite-plus/test"
import { authorizeMessageChange } from "@/contexts/chat/domain/authorize-message-change"
import { chatMessageSchema } from "@/contexts/chat/domain/chat-message"

const message = chatMessageSchema.parse({
  id: crypto.randomUUID(),
  channelId: "general",
  memberId: "writer",
  memberName: "投稿者",
  text: "hello",
  createdAt: 1,
})

describe("message ownership and concurrent changes", () => {
  it("allows the writer to change exactly the revision they read", () => {
    expect(authorizeMessageChange({ message, memberId: "writer", revision: 0 })).toBeNull()
  })
  it("refuses to expose a missing message as a successful change", () => {
    expect(
      authorizeMessageChange({ message: null, memberId: "writer", revision: 0 }),
    ).toMatchObject({ status: 404 })
  })
  it("denies changes by another participant, even with the current revision", () => {
    expect(authorizeMessageChange({ message, memberId: "other", revision: 0 })).toMatchObject({
      status: 403,
    })
  })
  it("rejects stale edits and deletes instead of overwriting another device", () => {
    expect(
      authorizeMessageChange({
        message: { ...message, revision: 2 },
        memberId: "writer",
        revision: 1,
      }),
    ).toMatchObject({ status: 409 })
  })
  it("never permits resurrecting a deleted message", () => {
    expect(
      authorizeMessageChange({
        message: { ...message, deletedAt: 2, revision: 1 },
        memberId: "writer",
        revision: 1,
      }),
    ).toMatchObject({ status: 409 })
  })
})
