import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { chatClient } from "@/client/chat-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { MessageAttachments } from "@/screens/message-attachments"

type Page = Awaited<ReturnType<typeof chatClient.search>>
export function SearchPanel(props: { channelId: string }) {
  const query = useState("")
  const page = useState<Page | null>(null)
  const selected = useState<string | null>(null)
  const search = useMutation({
    mutationFn: (cursor: { before?: number; until?: number }) =>
      chatClient.search(props.channelId, query[0], cursor.before, cursor.until),
    onSuccess: (result, cursor) =>
      page[1]((current) => ({
        ...result,
        results:
          cursor.before === undefined
            ? result.results
            : [...(current?.results ?? []), ...result.results],
      })),
  })
  const detail = useQuery({
    queryKey: ["message", props.channelId, selected[0]],
    enabled: selected[0] !== null,
    queryFn: () => chatClient.message(props.channelId, selected[0] ?? ""),
    staleTime: 0,
  })
  if (selected[0])
    return (
      <FieldGroup>
        <Button variant="ghost" onClick={() => selected[1](null)}>
          検索結果に戻る
        </Button>
        {detail.error && (
          <Alert variant="destructive">
            <AlertDescription>{detail.error.message}</AlertDescription>
          </Alert>
        )}
        {detail.data && !detail.error && (
          <>
            <p className="text-xs text-muted-foreground">{detail.data.memberName}</p>
            {!detail.data.attachments.length && (
              <p className="whitespace-pre-wrap break-words">{detail.data.text}</p>
            )}
            <MessageAttachments channelId={props.channelId} attachments={detail.data.attachments} />
          </>
        )}
      </FieldGroup>
    )
  return (
    <FieldGroup>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          search.mutate({})
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="search-messages">メッセージを検索</FieldLabel>
            <Input
              id="search-messages"
              value={query[0]}
              maxLength={100}
              required
              disabled={search.isPending}
              onChange={(event) => {
                query[1](event.target.value)
                page[1](null)
              }}
            />
          </Field>
          <Button type="submit" disabled={search.isPending}>
            検索
          </Button>
        </FieldGroup>
      </form>
      {search.error && (
        <Alert variant="destructive">
          <AlertDescription>{search.error.message}</AlertDescription>
        </Alert>
      )}
      {page[0]?.results.length === 0 && (
        <Empty>
          <EmptyDescription>
            {page[0].complete ? "見つかりませんでした" : "この範囲にはありません"}
          </EmptyDescription>
        </Empty>
      )}
      <div className="flex flex-col gap-1" aria-label="検索結果">
        {page[0] && (
          <p role="status" className="text-xs text-muted-foreground">
            {page[0].complete ? "検索完了" : "続きがあります"}
          </p>
        )}
        {page[0]?.results.map((result) => (
          <Button
            key={result.id}
            variant="ghost"
            className="h-auto flex-col items-start gap-1 whitespace-normal text-left"
            onClick={() => selected[1](result.id)}
          >
            <span className="text-xs text-muted-foreground">
              {result.memberName} · {new Date(result.createdAt).toLocaleString("ja-JP")}
            </span>
            <span className="line-clamp-3 break-all">{result.snippet}</span>
          </Button>
        ))}
      </div>
      {page[0]?.nextBefore !== null && page[0]?.nextBefore !== undefined && (
        <Button
          variant="outline"
          disabled={search.isPending}
          onClick={() =>
            search.mutate({ before: page[0]?.nextBefore ?? undefined, until: page[0]?.until })
          }
        >
          さらに検索
        </Button>
      )}
    </FieldGroup>
  )
}
