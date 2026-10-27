import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon, Settings01Icon } from "@hugeicons/core-free-icons"
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
import { SearchPanel } from "@/screens/search-panel"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"
import { emptyChatDraft } from "@/client/chat-draft"
import type { ChatDraft } from "@/client/chat-draft"
import type { Member } from "@open-stack/sdk/contracts"

type Props = { viewer: Member }

/** チャンネルと会話に画面を集中させる。 */
export function ChatScreen(props: Props) {
  const drafts = useState<Record<string, ChatDraft>>({})
  const selectedChannel = useState("general")
  const panel = useState<"members" | "account" | "channel" | "channel-settings" | "search" | null>(
    null,
  )
  const channelName = useState("")
  const channelRequestId = useState<string | null>(null)
  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: () => chatClient.channels(),
    refetchInterval: 30_000,
  })
  const activity = useQuery({
    queryKey: ["channel-activity", channels.data?.map((channel) => channel.id)],
    enabled: Boolean(channels.data),
    queryFn: async () => {
      const ids = channels.data?.map((channel) => channel.id) ?? []
      const result = []
      for (let offset = 0; offset < ids.length; offset += 50)
        result.push(...(await chatClient.channelActivity(ids.slice(offset, offset + 50))))
      return result
    },
    refetchInterval: 15_000,
  })
  const unread = (id: string) =>
    activity.data?.find((item) => item.channelId === id)?.unreadCount ?? 0
  const unreadTotal = activity.data?.reduce((total, item) => total + item.unreadCount, 0) ?? 0
  useEffect(() => {
    document.title = `${unreadTotal ? `(${unreadTotal > 99 ? "99+" : unreadTotal}) ` : ""}Void Chat`
    return () => {
      document.title = "Void Chat"
    }
  }, [unreadTotal])
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
              aria-current={selectedChannel[0] === channel.id ? "page" : undefined}
              onClick={() => selectedChannel[1](channel.id)}
            >
              <span className="text-muted-foreground">#</span>
              <span className="min-w-0 truncate">{channel.name}</span>
              {unread(channel.id) > 0 && (
                <span
                  className="ml-auto text-xs font-semibold"
                  aria-label={`${unread(channel.id) > 99 ? "99件以上" : `${unread(channel.id)}件`}の未読`}
                >
                  {unread(channel.id) > 99 ? "99+" : unread(channel.id)}
                </span>
              )}
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
          <h2 className="hidden min-w-0 flex-1 truncate text-sm font-medium sm:block">
            # {channel?.name ?? "…"}
          </h2>
          <div className="min-w-0 flex-1 sm:hidden">
            <NativeSelect
              className="w-full"
              aria-label="チャンネル"
              value={channel?.id ?? ""}
              onChange={(event) => selectedChannel[1](event.target.value)}
            >
              {channels.data?.map((channel) => (
                <NativeSelectOption key={channel.id} value={channel.id}>
                  # {channel.name}
                  {unread(channel.id)
                    ? ` · 未読${unread(channel.id) > 99 ? "99+" : unread(channel.id)}`
                    : ""}
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
          {channel && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="メッセージ検索"
              title="検索"
              onClick={() => panel[1]("search")}
            >
              <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" />
            </Button>
          )}
          {channel && props.viewer.role !== "member" && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="チャンネル設定"
              title="チャンネル設定"
              onClick={() => panel[1]("channel-settings")}
            >
              <HugeiconsIcon icon={Settings01Icon} data-icon="inline-start" />
            </Button>
          )}
        </header>
        {(channels.error || activity.error) && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>{channels.error?.message ?? activity.error?.message}</span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  void channels.refetch()
                  void activity.refetch()
                }}
              >
                再読込
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {channel && (
          <Conversation
            key={channel.id}
            channel={channel}
            viewerId={props.viewer.id}
            draft={drafts[0][channel.id] ?? emptyChatDraft}
            paused={panel[0] !== null}
            onSent={(id) =>
              drafts[1]((current) =>
                current[channel.id]?.id === id
                  ? { ...current, [channel.id]: emptyChatDraft }
                  : current,
              )
            }
            onDraftChange={(draft) => drafts[1]((current) => ({ ...current, [channel.id]: draft }))}
          />
        )}
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
              {panel[0] === "search"
                ? "検索"
                : panel[0] === "members"
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
          {panel[0] === "search" && channel && (
            <SearchPanel key={channel.id} channelId={channel.id} />
          )}
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
