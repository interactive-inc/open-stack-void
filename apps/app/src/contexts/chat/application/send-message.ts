import { chatMessageSchema } from "@/contexts/chat/domain/chat-message"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { Member } from "@/contexts/membership/domain/member"
import type { ChannelRepository } from "@/contexts/chat/infrastructure/repositories/channel.repository"
import type { MessageRepository } from "@/contexts/chat/infrastructure/repositories/message.repository"

type Context = Readonly<{
  channels: Pick<ChannelRepository, "findOne">
  messages: Pick<MessageRepository, "create">
  principal: ChatPrincipal
}>

/** チャンネルにメッセージを送る。 */
export class SendMessage {
  constructor(private readonly context: Context) {}

  async execute(
    member: Member,
    input: { channelId: string; id: string; text: string; replyToId?: string | null },
  ) {
    if (member.status !== "active" || member.id !== this.context.principal.memberId)
      return new ChatFailed("forbidden")

    const channel = await this.context.channels.findOne(input.channelId)

    if (!channel) return new ChatFailed("missing")

    const message = chatMessageSchema.safeParse({
      ...input,
      memberId: member.id,
      memberName: member.name,
      createdAt: Date.now(),
    })

    if (!message.success) return new ChatFailed("invalid")

    return this.context.messages.create(message.data, this.context.principal)
  }
}
