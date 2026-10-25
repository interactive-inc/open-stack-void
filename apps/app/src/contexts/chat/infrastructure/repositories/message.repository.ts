import { ChatRoom } from "@app/durable-objects/chat-room"
import type { ChatMessage } from "@/contexts/chat/domain/chat-message"

export class MessageRepository {
  async findMany(channelId: string, before: number | null) {
    return ChatRoom.get(channelId).list(before)
  }

  async create(message: ChatMessage) {
    const submission = await ChatRoom.get(message.channelId).append(message)

    if ("error" in submission) return new Error(submission.error)

    return submission.message
  }
}
