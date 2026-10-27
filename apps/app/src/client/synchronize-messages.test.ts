import { it, expect, vi, afterEach } from "vite-plus/test"
import type { Message } from "@open-stack/sdk/contracts"
import { RequestFailed } from "@open-stack/sdk"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"
import { synchronizeMessages, mergeMessages } from "@/client/synchronize-messages"

function message(sequence: number): Message {
  return {
    id: `message-${sequence}`,
    channelId: "channel",
    memberId: "member",
    memberName: "Member",
    text: `${sequence}`,
    createdAt: sequence,
    sequence,
    attachments: [],
    replyToId: null,
    revision: 0,
    editedAt: null,
    deletedAt: null,
  }
}
afterEach(() => {
  vi.restoreAllMocks()
  queryClient.clear()
})

it("recovers an empty known history across pages and repeats for changes during recovery", async () => {
  let total = 231
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  queryClient.setQueryData<Message[]>(["messages", "channel"], [])
  vi.spyOn(chatClient, "messages").mockImplementation(async () =>
    Array.from({ length: Math.min(100, total) }, (_, index) =>
      message(total - Math.min(100, total) + index + 1),
    ),
  )
  const pages = vi
    .spyOn(chatClient, "messagesAfter")
    .mockImplementation(async (_, after, until = total) => {
      if (after === 0) await gate
      return Array.from({ length: Math.min(100, until - after) }, (_, index) =>
        message(after + index + 1),
      )
    })
  const first = synchronizeMessages("channel")
  await vi.waitFor(() => expect(pages).toHaveBeenCalled())
  total = 232
  const next = synchronizeMessages("channel")
  expect(next).toBe(first)
  release()
  await first
  const result = queryClient.getQueryData<Message[]>(["messages", "channel"])
  expect(result?.map((message) => message.sequence)).toEqual(
    Array.from({ length: 232 }, (_, index) => index + 1),
  )
  expect(new Set(result?.map((message) => message.id)).size).toBe(232)
})

it("preserves concurrently loaded older history and retries a failed recovery from the last committed cursor", async () => {
  queryClient.setQueryData(["messages", "channel"], [message(100)])
  vi.spyOn(chatClient, "messages").mockResolvedValue([message(250)])
  const pages = vi.spyOn(chatClient, "messagesAfter").mockImplementation(async (_, after) => {
    if (after >= 200) throw new Error("Interrupted")
    return Array.from({ length: 100 }, (_, index) => message(after + index + 1))
  })
  await expect(synchronizeMessages("channel")).rejects.toThrow("Interrupted")
  expect(queryClient.getQueryData(["messages", "channel"])).toEqual([message(100)])
  pages.mockImplementation(async (_, after, until = 250) => {
    queryClient.setQueryData<Message[]>(["messages", "channel"], (current) => [
      message(99),
      ...(current ?? []),
    ])
    return Array.from({ length: Math.min(100, until - after) }, (_, index) =>
      message(after + index + 1),
    )
  })
  await synchronizeMessages("channel")
  const result = queryClient.getQueryData<Message[]>(["messages", "channel"])
  expect(result?.map((message) => message.sequence)).toEqual(
    Array.from({ length: 152 }, (_, index) => index + 99),
  )
})

it("clears inaccessible history after an explicit authorization failure", async () => {
  queryClient.setQueryData(["messages", "channel"], [message(1)])
  vi.spyOn(chatClient, "messages").mockRejectedValue(new RequestFailed(403, "Denied"))
  await expect(synchronizeMessages("channel")).rejects.toThrow("Denied")
  expect(queryClient.getQueryData(["messages", "channel"])).toEqual([])
})

it("does not repopulate a cleared account cache from a delayed response", async () => {
  queryClient.setQueryData(["messages", "channel"], [message(1)])
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const latest = vi.spyOn(chatClient, "messages").mockImplementation(async () => {
    await gate
    return [message(1)]
  })
  const recovery = synchronizeMessages("channel")
  await vi.waitFor(() => expect(latest).toHaveBeenCalled())
  queryClient.clear()
  release()
  await recovery
  expect(queryClient.getQueryData(["messages", "channel"])).toBeUndefined()
})

it("refreshes edits and deletions older than the latest page without resurrecting a newer revision", async () => {
  const original = message(1)
  queryClient.setQueryData(["messages", "channel"], [original, message(150)])
  vi.spyOn(chatClient, "messages").mockResolvedValue([message(150)])
  vi.spyOn(chatClient, "messagesAfter").mockImplementation(async (_, after, until = 150) =>
    Array.from({ length: Math.min(100, until - after) }, (_, index) => {
      const row = message(after + index + 1)
      return row.sequence === 1 ? { ...row, text: "", revision: 2, deletedAt: 10 } : row
    }),
  )
  await synchronizeMessages("channel")
  expect(queryClient.getQueryData<Message[]>(["messages", "channel"])?.[0]).toMatchObject({
    text: "",
    revision: 2,
    deletedAt: 10,
  })
})

it("does not merge a delayed old revision over a deletion", () => {
  const original = message(1)
  const removed = { ...original, text: "", revision: 2, deletedAt: 10 }
  expect(mergeMessages([removed], [original])).toEqual([removed])
})
