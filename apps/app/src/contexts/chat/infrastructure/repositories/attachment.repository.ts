import { ChatRoom } from "@app/durable-objects/chat-room"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import type { AttachmentSubmission } from "@/contexts/chat/domain/attachment"

export class AttachmentRepository {
  async create(channelId: string, principal: ChatPrincipal, input: AttachmentSubmission) {
    const result = await ChatRoom.get(channelId).upload(channelId, principal, input)
    return result.error !== undefined ? new ChatFailed(result.error) : result.attachment
  }
  async findMany(channelId: string, principal: ChatPrincipal, before: number | null) {
    const result = await ChatRoom.get(channelId).attachments(channelId, principal, before)
    return result.error !== undefined ? new ChatFailed(result.error) : result.page
  }
  async findOne(channelId: string, principal: ChatPrincipal, id: string) {
    const result = await ChatRoom.get(channelId).attachment(channelId, principal, id)
    return result.error !== undefined ? new ChatFailed(result.error) : result.file
  }
}
