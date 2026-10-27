import { it, expect } from "vite-plus/test"
import { MarkChannelRead } from "@/contexts/chat/application/mark-channel-read"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { Member } from "@/contexts/membership/domain/member"

it("only advances the current active actor's position, regardless of role", async () => {
  const writes: number[] = []
  const useCase = new MarkChannelRead({
    markRead: async (channelId, _, sequence) => {
      writes.push(sequence)
      return { channelId, readSequence: sequence, lastSequence: sequence, unreadCount: 0 }
    },
  })
  const actor: Member = {
    id: "actor",
    name: "Actor",
    email: "test@example.com",
    role: "member",
    status: "active",
    createdAt: 0,
  }
  const principal = { memberId: actor.id, sessionHash: "synthetic", kind: "browser" }
  expect(useCase.execute({ ...actor, status: "disabled" }, principal, "general", 1)).toBeInstanceOf(
    ChatFailed,
  )
  expect(useCase.execute({ ...actor, id: "other" }, principal, "general", 1)).toBeInstanceOf(
    ChatFailed,
  )
  for (const sequence of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(useCase.execute(actor, principal, "general", sequence)).toBeInstanceOf(ChatFailed)
  expect(writes).toEqual([])
  for (const role of ["owner", "admin", "member"] as const)
    expect(await useCase.execute({ ...actor, role }, principal, "general", 2)).toMatchObject({
      readSequence: 2,
    })
  expect(writes).toEqual([2, 2, 2])
})
