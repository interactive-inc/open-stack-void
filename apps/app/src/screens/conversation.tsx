import { useState } from "react"
import { useInfiniteQuery, useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
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
import type { Channel } from "@open-stack/sdk/contracts"

type Props = { channel: Channel }

/** チャンネルの会話を表示して送信する。 */
export function Conversation(props: Props) {
  const draft = useState("")
  const pendingId = useState<string | null>(null)
  const subscription = useState(() => () => subscribeChannel(props.channel.id))
  const messages = useInfiniteQuery({
    queryKey: ["messages", props.channel.id],
    initialPageParam: null,
    queryFn: (query: { pageParam: number | null }) =>
      chatClient.messages(props.channel.id, query.pageParam),
    getNextPageParam: (page) => (page.length === 100 ? page[0]?.sequence : undefined),
    refetchInterval: 15_000,
  })
  const send = useMutation({
    mutationFn: (submission: { text: string; id: string }) =>
      chatClient.sendMessage(props.channel.id, submission.text, submission.id),
    onSuccess: async () => {
      draft[1]("")
      pendingId[1](null)
      await queryClient.invalidateQueries({ queryKey: ["messages", props.channel.id] })
    },
  })

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      key={props.channel.id}
      ref={subscription[0]}
      aria-label={`#${props.channel.name}`}
    >
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
                {messages.hasNextPage && (
                  <MessageScrollerItem messageId="older-messages">
                    <Button
                      variant="ghost"
                      className="mx-auto"
                      disabled={messages.isFetchingNextPage}
                      onClick={() => {
                        void messages.fetchNextPage()
                      }}
                    >
                      以前のメッセージ
                    </Button>
                  </MessageScrollerItem>
                )}
                {messages.data?.pages
                  .slice()
                  .reverse()
                  .flat()
                  .map((message) => (
                    <MessageScrollerItem key={message.id} messageId={message.id}>
                      <Message>
                        <MessageAvatar className="self-start">
                          <Avatar size="sm">
                            <AvatarFallback>{message.memberName.slice(0, 1)}</AvatarFallback>
                          </Avatar>
                        </MessageAvatar>
                        <MessageContent className="gap-1">
                          <MessageHeader className="gap-2">
                            <span>{message.memberName}</span>
                            <time dateTime={new Date(message.createdAt).toISOString()}>
                              {new Date(message.createdAt).toLocaleTimeString("ja-JP", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </MessageHeader>
                          <Bubble variant="ghost">
                            <BubbleContent className="whitespace-pre-wrap">
                              {message.text}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ))}
                {messages.data?.pages[0]?.length === 0 && (
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
          if (!draft[0].trim() || send.isPending) return
          const id = pendingId[0] ?? crypto.randomUUID()
          pendingId[1](id)
          send.mutate({ text: draft[0], id })
        }}
      >
        {(send.error || messages.error) && (
          <Alert variant="destructive">
            <AlertDescription>{send.error?.message ?? messages.error?.message}</AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field orientation="horizontal" className="items-end">
            <Textarea
              aria-label={`#${props.channel.name} にメッセージ`}
              placeholder={`#${props.channel.name} にメッセージ`}
              className="min-h-12 resize-none rounded-2xl"
              rows={1}
              maxLength={4000}
              value={draft[0]}
              disabled={send.isPending}
              onChange={(event) => {
                draft[1](event.target.value)
                pendingId[1](null)
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
              disabled={send.isPending || !draft[0].trim()}
            >
              ↑
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  )
}
