import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import type { Member } from "@/contexts/membership/domain/member"
import type { ChannelControlRepository } from "@/contexts/chat/infrastructure/repositories/channel-control.repository"

export class SetChannelArchive {
  constructor(private readonly channels: Pick<ChannelControlRepository, "setArchived">) {}
  async execute(actor: Member, principal: ChatPrincipal, id: string, archived: boolean) {
    if (actor.status !== "active" || actor.role === "member" || actor.id !== principal.memberId)
      return new ChatFailed("forbidden")
    return this.channels.setArchived(principal, id, archived)
  }
}
