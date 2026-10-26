import { useState, useRef } from "react"
import { useMutation } from "@tanstack/react-query"
import type { Channel } from "@open-stack/sdk/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { chatClient } from "@/client/chat-client"
import { synchronizeMessages } from "@/client/synchronize-messages"

export function AttachmentComposer(props: { channel: Channel }) {
  const selected = useState<{ file: File; id: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const reset = useState(0)
  const upload = useMutation({
    mutationFn: async () => {
      if (!selected[0]) throw new Error("ファイルを選んでください")
      return chatClient.uploadAttachment(
        props.channel.id,
        selected[0].file.name,
        selected[0].file,
        selected[0].id,
      )
    },
    onSuccess: () => {
      selected[1](null)
      reset[1]((value) => value + 1)
      void synchronizeMessages(props.channel.id).catch(() => undefined)
    },
  })
  return (
    <div className="flex flex-col gap-2 px-4 pb-3 sm:px-6">
      <Field orientation="horizontal">
        <FieldLabel htmlFor={`attachment-${props.channel.id}`} className="sr-only">
          添付ファイル
        </FieldLabel>
        <Input
          ref={input}
          key={reset[0]}
          className="hidden"
          id={`attachment-${props.channel.id}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,text/plain"
          disabled={upload.isPending || props.channel.archived}
          onChange={(event) => {
            const file = event.target.files?.[0]
            selected[1](file ? { file, id: crypto.randomUUID() } : null)
            upload.reset()
          }}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="ファイルを選択"
          title="PNG/JPEG/WebP/TXT · 512KiBまで"
          disabled={upload.isPending || props.channel.archived}
          onClick={() => input.current?.click()}
        >
          ＋
        </Button>
        {selected[0] && (
          <>
            <span className="min-w-0 flex-1 truncate text-xs">{selected[0].file.name}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={upload.isPending || props.channel.archived}
              onClick={() => upload.mutate()}
            >
              添付
            </Button>
          </>
        )}
      </Field>
      {upload.error && (
        <Alert variant="destructive">
          <AlertDescription>{upload.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
