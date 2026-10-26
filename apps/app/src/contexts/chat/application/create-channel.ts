import { channelNameSchema } from "@/contexts/chat/domain/channel"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import type { Member } from "@/contexts/membership/domain/member"
import type { ChannelRepository } from "@/contexts/chat/infrastructure/repositories/channel.repository"

export class CreateChannel {
  constructor(private readonly channels: Pick<ChannelRepository, "create">) {}
  async execute(actor: Member, principal: ChatPrincipal, input: { id: string; name: string }) {
    if (actor.status !== "active" || actor.role === "member" || actor.id !== principal.memberId)
      return new ChatFailed("forbidden")
    const name = channelNameSchema.safeParse(input.name)
    if (!name.success) return new ChatFailed("invalid")
    return this.channels.create(principal, { ...input, name: name.data })
  }
}
