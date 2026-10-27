import type { Member } from "@/contexts/membership/domain/member"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { ChannelActivityRepository } from "@/contexts/chat/infrastructure/repositories/channel-activity.repository"

export class MarkChannelRead {
  constructor(private readonly repository: Pick<ChannelActivityRepository, "markRead">) {}

  execute(member: Member, principal: ChatPrincipal, channelId: string, sequence: number) {
    if (member.status !== "active" || member.id !== principal.memberId)
      return new ChatFailed("forbidden")
    if (!Number.isSafeInteger(sequence) || sequence < 0) return new ChatFailed("invalid")
    return this.repository.markRead(channelId, principal, sequence)
  }
}
