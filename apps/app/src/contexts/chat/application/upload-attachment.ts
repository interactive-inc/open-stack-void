import { validateAttachment } from "@/contexts/chat/domain/attachment"
import type { AttachmentSubmission } from "@/contexts/chat/domain/attachment"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import type { Member } from "@/contexts/membership/domain/member"
import type { AttachmentRepository } from "@/contexts/chat/infrastructure/repositories/attachment.repository"

/** 添付ファイルを投稿する。 */
export class UploadAttachment {
  constructor(private readonly attachments: Pick<AttachmentRepository, "create">) {}
  async execute(
    member: Member,
    principal: ChatPrincipal,
    channelId: string,
    input: AttachmentSubmission,
  ) {
    if (member.status !== "active" || member.id !== principal.memberId)
      return new ChatFailed("forbidden")
    const validated = validateAttachment(input)
    if (validated instanceof ChatFailed) return validated
    return this.attachments.create(channelId, principal, { ...input, ...validated })
  }
}
