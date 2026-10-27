import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Field, FieldGroup } from "@/components/ui/field"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"
import { subscribeChannel } from "@/client/subscribe-channel"
import { ConversationMessage } from "@/screens/conversation-message"
import { Skeleton } from "@/components/ui/skeleton"
import { AttachmentComposer } from "@/screens/attachment-composer"
import { synchronizeMessages, mergeMessages } from "@/client/synchronize-messages"
import type { Message as ChatMessage } from "@open-stack/sdk/contracts"
import { MessageReference } from "@/screens/message-reference"
import { ChannelReadMarker } from "@/screens/channel-read-marker"
import type { ChatDraft } from "@/client/chat-draft"
import type { Channel } from "@open-stack/sdk/contracts"

type Props = {
  channel: Channel
  viewerId: string
  draft: ChatDraft
  paused: boolean
  onDraftChange: (draft: ChatDraft) => void
  onSent: (id: string) => void
}

/** チャンネルの会話を表示して送信する。 */
export function Conversation(props: Props) {
  const composer = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (props.draft.replyToId && document.hasFocus()) composer.current?.focus()
  }, [props.draft.replyToId])
  const connection = useState<"connecting" | "connected" | "retrying">("connecting")
  const subscription = useState(() => () => subscribeChannel(props.channel.id, connection[1]))
  const hasOlder = useState(true)
  const messages = useQuery({
    queryKey: ["messages", props.channel.id],
    queryFn: () => chatClient.messages(props.channel.id),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const older = useMutation({
    mutationFn: async () => {
      const owner = queryClient
        .getQueryCache()
        .find({ queryKey: ["messages", props.channel.id], exact: true })
      const page = await chatClient.messages(props.channel.id, messages.data?.[0]?.sequence ?? null)
      return { owner, page }
    },
    onSuccess: ({ owner, page }) => {
      if (
        queryClient
          .getQueryCache()
          .find({ queryKey: ["messages", props.channel.id], exact: true }) !== owner
      )
        return
      hasOlder[1](page.length === 100)
      queryClient.setQueryData<ChatMessage[]>(["messages", props.channel.id], (current) =>
        mergeMessages(current, page),
      )
    },
  })
  const send = useMutation({
    mutationFn: (submission: { text: string; id: string; replyToId: string | null }) =>
      chatClient.sendMessage(
        props.channel.id,
        submission.text,
        submission.id,
        submission.replyToId,
      ),
    onSuccess: async (_, submission) => {
      props.onSent(submission.id)
      await synchronizeMessages(props.channel.id)
    },
  })

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      key={props.channel.id}
      ref={subscription[0]}
      aria-label={`#${props.channel.name}`}
    >
      {connection[0] !== "connected" && (
        <p role="status" className="px-4 py-1 text-xs text-muted-foreground">
          {connection[0] === "retrying" ? "再接続しています…" : "接続を確認しています…"}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider autoScroll>
          <MessageScroller>
            <MessageScrollerViewport aria-label="メッセージ履歴">
              <MessageScrollerContent
                className="gap-3 p-5 sm:p-6"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
              >
                {messages.isPending && (
                  <MessageScrollerItem messageId="loading">
                    <Skeleton className="h-12 w-full" aria-label="投稿を読み込み中" />
                  </MessageScrollerItem>
                )}
                {hasOlder[0] && (messages.data?.length ?? 0) >= 100 && (
                  <MessageScrollerItem messageId="older-messages">
                    <Button
                      variant="ghost"
                      className="mx-auto"
                      disabled={older.isPending}
                      onClick={() => {
                        older.mutate()
                      }}
                    >
                      以前のメッセージ
                    </Button>
                  </MessageScrollerItem>
                )}
                {messages.data?.map((message) => (
                  <MessageScrollerItem key={message.id} messageId={message.id}>
                    <ConversationMessage
                      message={message}
                      viewerId={props.viewerId}
                      archived={props.channel.archived}
                      onReply={() =>
                        props.onDraftChange({
                          ...props.draft,
                          replyToId: message.id,
                          id: crypto.randomUUID(),
                        })
                      }
                    />
                  </MessageScrollerItem>
                ))}
                {messages.data && (
                  <MessageScrollerItem messageId="read-marker">
                    <ChannelReadMarker
                      channelId={props.channel.id}
                      sequence={messages.data.at(-1)?.sequence ?? 0}
                      paused={props.paused}
                    />
                  </MessageScrollerItem>
                )}
                {messages.data?.length === 0 && (
                  <MessageScrollerItem messageId="empty">
                    <Empty>
                      <EmptyDescription>最初のメッセージを送信</EmptyDescription>
                    </Empty>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      <form
        className="flex flex-col gap-2 px-4 py-3 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (!props.draft.text.trim() || send.isPending || props.channel.archived) return
          const id = props.draft.id ?? crypto.randomUUID()
          props.onDraftChange({ ...props.draft, id })
          send.mutate({ text: props.draft.text, id, replyToId: props.draft.replyToId })
        }}
      >
        {props.draft.replyToId && (
          <div className="flex items-start justify-between gap-2">
            <MessageReference channelId={props.channel.id} id={props.draft.replyToId} />
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={send.isPending}
              onClick={() =>
                props.onDraftChange({ ...props.draft, replyToId: null, id: crypto.randomUUID() })
              }
            >
              返信を取り消す
            </Button>
          </div>
        )}
        {(send.error || messages.error || older.error) && (
          <Alert variant="destructive">
            <AlertDescription>
              {send.error instanceof TypeError
                ? "送信結果を確認できません。同じ文章で再送してください"
                : (send.error?.message ?? messages.error?.message ?? older.error?.message)}
              {send.error && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={send.isPending}
                  onClick={() => {
                    const id = props.draft.id ?? crypto.randomUUID()
                    props.onDraftChange({ ...props.draft, id })
                    send.mutate({ text: props.draft.text, id, replyToId: props.draft.replyToId })
                  }}
                >
                  再送
                </Button>
              )}
              {(messages.error || older.error) && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => void synchronizeMessages(props.channel.id).catch(() => undefined)}
                >
                  履歴を再取得
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {props.channel.archived && <p className="text-xs text-muted-foreground">アーカイブ済み</p>}
        <FieldGroup>
          <Field orientation="horizontal" className="items-end">
            <Textarea
              ref={composer}
              aria-label={`#${props.channel.name} にメッセージ`}
              placeholder={`#${props.channel.name} にメッセージ`}
              className="min-h-12 resize-none rounded-2xl"
              rows={1}
              maxLength={4000}
              value={props.draft.text}
              disabled={send.isPending || props.channel.archived}
              onChange={(event) => {
                props.onDraftChange({
                  ...props.draft,
                  text: event.target.value,
                  id: crypto.randomUUID(),
                })
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              aria-label="送信"
              title="送信"
              disabled={send.isPending || props.channel.archived || !props.draft.text.trim()}
            >
              ↑
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <AttachmentComposer channel={props.channel} />
    </section>
  )
}
