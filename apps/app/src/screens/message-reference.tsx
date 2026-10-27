import { useQuery } from "@tanstack/react-query"
import { chatClient } from "@/client/chat-client"
import { Button } from "@/components/ui/button"

type Props = { channelId: string; id: string }

/** 引用本文を複製せず、現在の認可と削除状態で返信元を確認する。 */
export function MessageReference(props: Props) {
  const original = useQuery({
    queryKey: ["message", props.channelId, props.id],
    queryFn: () => chatClient.message(props.channelId, props.id),
  })
  return (
    <div
      className="min-w-0 border-l-2 border-border pl-3 text-xs text-muted-foreground"
      aria-label="返信元"
    >
      {original.data && !original.error ? (
        <>
          <span className="font-medium">{original.data.memberName}</span>
          <p className="line-clamp-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {original.data.deletedAt ? "この投稿は削除されました" : original.data.text}
          </p>
        </>
      ) : original.error ? (
        <Button size="xs" variant="ghost" onClick={() => void original.refetch()}>
          返信元を再取得
        </Button>
      ) : (
        "返信元を確認中…"
      )}
    </div>
  )
}
