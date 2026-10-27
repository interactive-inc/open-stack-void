import type { ChatMessage } from "@/contexts/chat/domain/chat-message"
import { MessageChangeError } from "@/contexts/chat/domain/message-change-error"

/** 投稿者本人による、表示した版への変更だけを許可する。 */
export function authorizeMessageChange(props: {
  message: ChatMessage | null
  memberId: string
  revision: number
}) {
  if (!props.message) return new MessageChangeError("投稿が見つかりません", 404)
  if (props.message.memberId !== props.memberId)
    return new MessageChangeError("自分の投稿だけを変更できます", 403)
  if (props.message.deletedAt !== null)
    return new MessageChangeError("この投稿は削除されています", 409)
  if (props.message.revision !== props.revision)
    return new MessageChangeError("投稿が更新されました。最新の内容を確認してください", 409)
  return null
}
