import { ChatRoom } from "@app/durable-objects/chat-room"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"

export class ChannelControlRepository {
  async rename(principal: ChatPrincipal, id: string, name: string) {
    const result = await ChatRoom.get(id).rename(id, principal, name)
    return result.error !== undefined ? new ChatFailed(result.error) : result.channel
  }
  async setArchived(principal: ChatPrincipal, id: string, archived: boolean) {
    const result = await ChatRoom.get(id).setArchived(id, principal, archived)
    return result.error !== undefined ? new ChatFailed(result.error) : result.channel
  }
}
