import { chatMessageSchema } from "@/contexts/chat/domain/chat-message"
import type { Member } from "@/contexts/membership/domain/member"
import type { ChannelRepository } from "@/contexts/chat/infrastructure/repositories/channel.repository"
import type { MessageRepository } from "@/contexts/chat/infrastructure/repositories/message.repository"

type Context = Readonly<{
  channels: Pick<ChannelRepository, "findOne">
  messages: Pick<MessageRepository, "create">
}>

/** チャンネルにメッセージを送る。 */
export class SendMessage {
  constructor(private readonly context: Context) {}

  async execute(member: Member, input: { channelId: string; id: string; text: string }) {
    if (member.status !== "active") return new Error("アクセスが停止されています")

    const channel = await this.context.channels.findOne(input.channelId)

    if (!channel) return new Error("チャンネルが見つかりません")

    const message = chatMessageSchema.safeParse({
      ...input,
      memberId: member.id,
      memberName: member.name,
      createdAt: Date.now(),
    })

    if (!message.success) return new Error("メッセージは1〜4000文字で入力してください")

    return this.context.messages.create(message.data)
  }
}
