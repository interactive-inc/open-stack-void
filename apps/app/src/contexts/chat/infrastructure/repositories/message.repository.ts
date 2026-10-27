import { ChatRoom } from "@app/durable-objects/chat-room"
import type { ChatMessage } from "@/contexts/chat/domain/chat-message"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import { MessageChangeError } from "@/contexts/chat/domain/message-change-error"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"

export class MessageRepository {
  async search(
    channelId: string,
    principal: ChatPrincipal,
    q: string,
    before: number | null,
    until: number | null,
  ) {
    const result = await ChatRoom.get(channelId).search(channelId, principal, q, before, until)
    return result.error !== undefined ? new ChatFailed(result.error) : result.page
  }
  async findOne(channelId: string, principal: ChatPrincipal, id: string) {
    const result = await ChatRoom.get(channelId).message(channelId, principal, id)
    return result.error !== undefined ? new ChatFailed(result.error) : result.message
  }
  async findMany(
    channelId: string,
    principal: ChatPrincipal,
    before: number | null,
    after: number | null,
    until: number | null,
  ) {
    const result = await ChatRoom.get(channelId).list(channelId, principal, before, after, until)
    return result.error !== undefined ? new ChatFailed(result.error) : result.messages
  }

  async change(
    channelId: string,
    principal: ChatPrincipal,
    input: { id: string; revision: number; text: string | null },
  ) {
    const result = await ChatRoom.get(channelId).change(channelId, principal, input)
    return "error" in result ? new MessageChangeError(result.error, result.status) : result.message
  }

  async create(message: ChatMessage, principal: ChatPrincipal) {
    const submission = await ChatRoom.get(message.channelId).append(message, principal)

    if (submission.error !== undefined) return new ChatFailed(submission.error)

    return submission.message
  }
}
