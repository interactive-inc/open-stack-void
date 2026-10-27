import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup } from "@/components/ui/field"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"
import { synchronizeMessages } from "@/client/synchronize-messages"
import { MessageReference } from "@/screens/message-reference"
import { MessageAttachments } from "@/screens/message-attachments"
import type { Message as ChatMessage } from "@open-stack/sdk/contracts"

type Props = { message: ChatMessage; viewerId: string; archived: boolean; onReply: () => void }

/** 投稿を読み、本人の投稿だけを編集または確認後に削除する。 */
export function ConversationMessage(props: Props) {
  const editing = useState<{ text: string; revision: number } | null>(null)
  const removal = useState<number | null>(null)
  const own = props.message.memberId === props.viewerId
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      editing[1](null)
      removal[1](null)
      await synchronizeMessages(props.message.channelId)
      await queryClient.invalidateQueries({ queryKey: ["message", props.message.channelId] })
    },
    onError: () => {
      void synchronizeMessages(props.message.channelId).catch(() => undefined)
    },
  })

  return (
    <Message align={own ? "end" : "start"}>
      {!own && (
        <MessageAvatar className="self-start">
          <Avatar size="sm">
            <AvatarFallback>{props.message.memberName.slice(0, 1)}</AvatarFallback>
          </Avatar>
        </MessageAvatar>
      )}
      <MessageContent
        className={own ? "w-fit max-w-[85%] min-w-0 items-end gap-1" : "min-w-0 gap-1"}
      >
        <MessageHeader className="flex-wrap gap-2">
          <span>{props.message.memberName}</span>
          <time dateTime={new Date(props.message.createdAt).toISOString()}>
            {new Date(props.message.createdAt).toLocaleString("ja-JP", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {props.message.editedAt && !props.message.deletedAt && <span>編集済み</span>}
        </MessageHeader>
        {props.message.replyToId && (
          <MessageReference channelId={props.message.channelId} id={props.message.replyToId} />
        )}
        {editing[0] ? (
          <form
            className="grid w-72 max-w-full gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const edit = editing[0]
              if (edit && edit.text.trim() && !mutation.isPending)
                mutation.mutate(() =>
                  chatClient.editMessage(
                    props.message.channelId,
                    props.message.id,
                    edit.text,
                    edit.revision,
                  ),
                )
            }}
          >
            <FieldGroup>
              <Field>
                <Textarea
                  aria-label="投稿を編集"
                  value={editing[0].text}
                  maxLength={4000}
                  rows={3}
                  disabled={mutation.isPending}
                  onChange={(event) =>
                    editing[1]({
                      text: event.target.value,
                      revision: editing[0]?.revision ?? props.message.revision,
                    })
                  }
                />
              </Field>
            </FieldGroup>
            <div className="flex gap-2">
              <Button
                size="sm"
                type="submit"
                disabled={mutation.isPending || !editing[0].text.trim()}
              >
                保存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  editing[1](null)
                  mutation.reset()
                }}
              >
                取り消す
              </Button>
            </div>
          </form>
        ) : props.message.attachments.length ? (
          <MessageAttachments
            channelId={props.message.channelId}
            attachments={props.message.attachments}
          />
        ) : (
          <Bubble variant={own ? "muted" : "ghost"} align={own ? "end" : "start"}>
            <BubbleContent className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {props.message.deletedAt ? "この投稿は削除されました" : props.message.text}
            </BubbleContent>
          </Bubble>
        )}
        {!props.archived && !props.message.deletedAt && !editing[0] && (
          <div className="flex gap-1">
            <Button variant="ghost" size="xs" aria-label="この投稿に返信" onClick={props.onReply}>
              返信
            </Button>
            {own && !props.message.attachments.length && (
              <>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="この投稿を編集"
                  onClick={() => {
                    mutation.reset()
                    editing[1]({ text: props.message.text, revision: props.message.revision })
                  }}
                >
                  編集
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="この投稿を削除"
                  onClick={() => {
                    mutation.reset()
                    removal[1](props.message.revision)
                  }}
                >
                  削除
                </Button>
              </>
            )}
          </div>
        )}
        {mutation.error && removal[0] === null && (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        )}
        <Dialog
          open={removal[0] !== null}
          onOpenChange={(open) => {
            if (!open && !mutation.isPending) {
              removal[1](null)
              mutation.reset()
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>投稿を削除しますか？</DialogTitle>
              <DialogDescription>
                本文は削除され、元に戻せません。投稿があった場所には削除済みの表示が残ります。
              </DialogDescription>
            </DialogHeader>
            {mutation.error && (
              <Alert variant="destructive">
                <AlertDescription>{mutation.error.message}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => removal[1](null)}
              >
                取り消す
              </Button>
              <Button
                variant="destructive"
                disabled={mutation.isPending}
                onClick={() => {
                  const revision = removal[0]
                  if (revision !== null)
                    mutation.mutate(() =>
                      chatClient.deleteMessage(props.message.channelId, props.message.id, revision),
                    )
                }}
              >
                {mutation.isPending ? "削除中…" : "削除する"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </MessageContent>
    </Message>
  )
}
