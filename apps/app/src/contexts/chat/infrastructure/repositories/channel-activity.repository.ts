import { ChatRoom } from "@app/durable-objects/chat-room"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"

export class ChannelActivityRepository {
  async findOne(channelId: string, principal: ChatPrincipal) {
    const result = await ChatRoom.get(channelId).activity(channelId, principal)
    return result.error !== undefined ? new ChatFailed(result.error) : result.activity
  }

  async markRead(channelId: string, principal: ChatPrincipal, sequence: number) {
    const result = await ChatRoom.get(channelId).markRead(channelId, principal, sequence)
    return result.error !== undefined ? new ChatFailed(result.error) : result.activity
  }
}
