import { RequestFailed } from "@open-stack/sdk"
import type { Message } from "@open-stack/sdk/contracts"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"

const running = new Map<string, { dirty: boolean; promise: Promise<void> }>()

export function mergeMessages(current: Message[] = [], incoming: Message[]) {
  const messages = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) {
    const existing = messages.get(message.id)
    if (!existing || message.revision >= existing.revision) messages.set(message.id, message)
  }
  return [...messages.values()].sort((left, right) => left.sequence - right.sequence)
}

export function synchronizeMessages(channelId: string): Promise<void> {
  const active = running.get(channelId)
  if (active) {
    active.dirty = true
    return active.promise
  }
  const state = { dirty: true, promise: Promise.resolve() }
  running.set(channelId, state)
  state.promise = (async () => {
    try {
      do {
        state.dirty = false
        const key = ["messages", channelId]
        await queryClient.cancelQueries({ queryKey: key, exact: true })
        const owner = queryClient.getQueryCache().find({ queryKey: key, exact: true })
        const current = queryClient.getQueryData<Message[]>(key)
        const latest = await chatClient.messages(channelId)
        if (queryClient.getQueryCache().find({ queryKey: key, exact: true }) !== owner) return
        let cursor = current?.at(-1)?.sequence ?? 0
        const upper = latest.at(-1)?.sequence ?? 0
        const recovered: Message[] = []
        if (current === undefined) recovered.push(...latest)
        else
          while (cursor < upper) {
            const page = await chatClient.messagesAfter(channelId, cursor, upper)
            const next = page.at(-1)?.sequence
            if (next === undefined || next <= cursor) throw new Error("履歴を再取得してください")
            recovered.push(...page)
            cursor = next
          }
        // Edits keep their original sequence. Recheck the loaded range separately
        // so reconnect's exclusive append cursor remains stable.
        if (current?.length) {
          let refreshCursor = Math.max(0, current[0]!.sequence - 1)
          const refreshUntil = current.at(-1)!.sequence
          while (refreshCursor < refreshUntil) {
            const page = await chatClient.messagesAfter(channelId, refreshCursor, refreshUntil)
            const next = page.at(-1)?.sequence
            if (next === undefined || next <= refreshCursor)
              throw new Error("履歴を再取得してください")
            recovered.push(...page)
            refreshCursor = next
          }
        }
        if (queryClient.getQueryCache().find({ queryKey: key, exact: true }) !== owner) return
        queryClient.setQueryData<Message[]>(key, (previous) => mergeMessages(previous, recovered))
      } while (state.dirty)
    } catch (error) {
      if (error instanceof RequestFailed && [401, 403].includes(error.status)) {
        queryClient.setQueryData(["messages", channelId], [])
        await queryClient.invalidateQueries({ queryKey: ["me"] })
      }
      throw error
    } finally {
      running.delete(channelId)
    }
  })()
  return state.promise
}
