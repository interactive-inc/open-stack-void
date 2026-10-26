import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Conversation } from "@/screens/conversation"
import { MembersPanel } from "@/screens/members-panel"
import { AccountPanel } from "@/screens/account-panel"
import { ChannelSettingsPanel } from "@/screens/channel-settings-panel"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"
import type { Member } from "@open-stack/sdk/contracts"

type Props = { viewer: Member }

/** チャンネルと会話に画面を集中させる。 */
export function ChatScreen(props: Props) {
  const selectedChannel = useState("general")
  const panel = useState<"members" | "account" | "channel" | "channel-settings" | null>(null)
  const channelName = useState("")
  const channelRequestId = useState<string | null>(null)
  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: () => chatClient.channels(),
    refetchInterval: 30_000,
  })
  const channel =
    channels.data?.find((channel) => channel.id === selectedChannel[0]) ?? channels.data?.[0]
  const createChannel = useMutation({
    mutationFn: () => {
      const id = channelRequestId[0] ?? crypto.randomUUID()
      channelRequestId[1](id)
      return chatClient.createChannel(channelName[0], id)
    },
    onSuccess: async (channel) => {
      selectedChannel[1](channel.id)
      channelName[1]("")
      channelRequestId[1](null)
      panel[1](null)
      await queryClient.invalidateQueries({ queryKey: ["channels"] })
    },
  })

  return (
    <main className="flex h-dvh min-h-0 overflow-hidden bg-background">
      <aside className="hidden w-52 shrink-0 flex-col border-r bg-muted/20 sm:flex">
        <div className="flex h-14 items-center px-5">
          <h1 className="font-semibold tracking-tight">
            Void Chat<span className="text-muted-foreground">.</span>
          </h1>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs text-muted-foreground">チャンネル</span>
          {props.viewer.role !== "member" && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="チャンネルを作成"
              onClick={() => panel[1]("channel")}
            >
              +
            </Button>
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2" aria-label="チャンネル">
          {channels.data?.map((channel) => (
            <Button
              key={channel.id}
              variant={selectedChannel[0] === channel.id ? "secondary" : "ghost"}
              className="justify-start gap-2 rounded-lg"
              onClick={() => selectedChannel[1](channel.id)}
            >
              <span className="text-muted-foreground">#</span>
              {channel.name}
              {channel.archived && (
                <span className="text-xs text-muted-foreground">アーカイブ</span>
              )}
            </Button>
          ))}
        </nav>
        <div className="grid gap-1 p-2">
          <Button
            variant="ghost"
            className="justify-start rounded-lg"
            onClick={() => panel[1]("members")}
          >
            メンバー
          </Button>
          <Button
            variant="ghost"
            className="justify-start gap-2 rounded-lg"
            aria-label="アカウント設定"
            onClick={() => panel[1]("account")}
          >
            <Avatar size="sm">
              <AvatarFallback>{props.viewer.name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{props.viewer.name}</span>
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 sm:px-6">
          <h2 className="hidden text-sm font-medium sm:block"># {channel?.name ?? "…"}</h2>
          <div className="sm:hidden">
            <NativeSelect
              aria-label="チャンネル"
              value={channel?.id ?? ""}
              onChange={(event) => selectedChannel[1](event.target.value)}
            >
              {channels.data?.map((channel) => (
                <NativeSelectOption key={channel.id} value={channel.id}>
                  # {channel.name}
                  {channel.archived ? "（アーカイブ）" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex gap-1 sm:hidden">
            {props.viewer.role !== "member" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="チャンネルを作成"
                onClick={() => panel[1]("channel")}
              >
                +
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => panel[1]("members")}>
              メンバー
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="アカウント設定"
              onClick={() => panel[1]("account")}
            >
              設定
            </Button>
          </div>
          {channel && props.viewer.role !== "member" && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="チャンネル設定"
              onClick={() => panel[1]("channel-settings")}
            >
              編集
            </Button>
          )}
        </header>
        {channels.error && (
          <Alert variant="destructive">
            <AlertDescription>{channels.error.message}</AlertDescription>
          </Alert>
        )}
        {channel && <Conversation key={channel.id} channel={channel} />}
      </div>
      <Dialog
        open={panel[0] !== null}
        onOpenChange={(open) => {
          if (!open) panel[1](null)
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {panel[0] === "members"
                ? "メンバー"
                : panel[0] === "account"
                  ? "アカウント"
                  : panel[0] === "channel-settings"
                    ? "チャンネル設定"
                    : "チャンネルを作成"}
            </DialogTitle>
            <DialogDescription className="sr-only">チームとアカウントの管理</DialogDescription>
          </DialogHeader>
          {panel[0] === "members" && <MembersPanel viewer={props.viewer} />}
          {panel[0] === "account" && <AccountPanel viewer={props.viewer} />}
          {panel[0] === "channel-settings" && channel && (
            <ChannelSettingsPanel key={channel.id} channel={channel} />
          )}
          {panel[0] === "channel" && (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                createChannel.mutate()
              }}
            >
              <FieldGroup>
                <Field className="gap-2">
                  <FieldLabel htmlFor="channel-name">チャンネル名</FieldLabel>
                  <Input
                    id="channel-name"
                    value={channelName[0]}
                    onChange={(event) => {
                      channelName[1](event.target.value)
                      channelRequestId[1](null)
                    }}
                    disabled={createChannel.isPending}
                    placeholder="design"
                    pattern="[a-z0-9][a-z0-9-]{0,39}"
                    maxLength={40}
                    required
                    autoFocus
                  />
                </Field>
              </FieldGroup>
              {createChannel.error && (
                <Alert variant="destructive">
                  <AlertDescription>{createChannel.error.message}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={createChannel.isPending}>
                作成
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
