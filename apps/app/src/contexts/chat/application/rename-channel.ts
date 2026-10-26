import { channelNameSchema } from "@/contexts/chat/domain/channel"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import type { Member } from "@/contexts/membership/domain/member"
import type { ChannelControlRepository } from "@/contexts/chat/infrastructure/repositories/channel-control.repository"

export class RenameChannel {
  constructor(private readonly channels: Pick<ChannelControlRepository, "rename">) {}
  async execute(actor: Member, principal: ChatPrincipal, id: string, input: string) {
    if (actor.status !== "active" || actor.role === "member" || actor.id !== principal.memberId)
      return new ChatFailed("forbidden")
    const name = channelNameSchema.safeParse(input)
    if (!name.success) return new ChatFailed("invalid")
    return this.channels.rename(principal, id, name.data)
  }
}
