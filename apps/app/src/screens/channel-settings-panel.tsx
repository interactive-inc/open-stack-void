import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { Channel } from "@open-stack/sdk/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"

export function ChannelSettingsPanel(props: { channel: Channel }) {
  const name = useState(props.channel.name)
  const confirm = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["channels"] })
  const rename = useMutation({
    mutationFn: () => chatClient.renameChannel(props.channel.id, name[0]),
    onSuccess: refresh,
  })
  const archive = useMutation({
    mutationFn: (archived: boolean) => chatClient.setChannelArchived(props.channel.id, archived),
    onSuccess: async () => {
      confirm[1](false)
      await refresh()
    },
  })
  const pending = rename.isPending || archive.isPending
  return (
    <FieldGroup>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          rename.mutate()
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="rename-channel">チャンネル名</FieldLabel>
            <Input
              id="rename-channel"
              value={name[0]}
              onChange={(event) => name[1](event.target.value)}
              pattern="[a-z0-9][a-z0-9-]{0,39}"
              maxLength={40}
              required
              disabled={pending}
            />
          </Field>
          {rename.error && (
            <Alert variant="destructive">
              <AlertDescription>{rename.error.message}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending}>
            保存
          </Button>
        </FieldGroup>
      </form>
      {archive.error && (
        <Alert variant="destructive">
          <AlertDescription>{archive.error.message}</AlertDescription>
        </Alert>
      )}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => (props.channel.archived ? archive.mutate(false) : confirm[1](true))}
      >
        {props.channel.archived ? "チャンネルを復帰" : "アーカイブ"}
      </Button>
      <AlertDialog
        open={confirm[0]}
        onOpenChange={(open) => {
          if (!archive.isPending) confirm[1](open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>アーカイブしますか？</AlertDialogTitle>
            <AlertDialogDescription>
              履歴を残して送信を停止します。後から復帰できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {archive.error && (
            <Alert variant="destructive">
              <AlertDescription>{archive.error.message}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archive.isPending}>キャンセル</AlertDialogCancel>
            <AlertDialogAction disabled={archive.isPending} onClick={() => archive.mutate(true)}>
              アーカイブする
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FieldGroup>
  )
}
