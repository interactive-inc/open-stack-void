import type { Member } from "@/contexts/membership/domain/member"
import type { ChannelRepository } from "@/contexts/chat/infrastructure/repositories/channel.repository"
import type { MessageRepository } from "@/contexts/chat/infrastructure/repositories/message.repository"
import { MessageChangeError } from "@/contexts/chat/domain/message-change-error"

import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"

type Props = {
  principal: ChatPrincipal
  channels: Pick<ChannelRepository, "findOne">
  messages: Pick<MessageRepository, "change">
}

/** 投稿者本人が、他の端末の変更を上書きせずに本文を編集する。 */
export class EditMessage {
  constructor(private readonly props: Props) {
    Object.freeze(this)
  }

  async execute(
    member: Member,
    input: { channelId: string; id: string; revision: number; text: string },
  ) {
    if (member.status !== "active" || member.id !== this.props.principal.memberId)
      return new MessageChangeError("アクセスが停止されています", 403)
    if (!(await this.props.channels.findOne(input.channelId)))
      return new MessageChangeError("部屋が見つかりません", 404)
    const text = input.text.trim()
    if (!text || text.length > 4000)
      return new MessageChangeError("本文は1〜4000文字で入力してください", 409)
    return this.props.messages.change(input.channelId, this.props.principal, {
      id: input.id,
      revision: input.revision,
      text,
    })
  }
}
