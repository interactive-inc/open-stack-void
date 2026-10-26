import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"
import { passkeyAction } from "@/client/passkey-action"
import type { Member } from "@open-stack/sdk/contracts"

type Props = { viewer: Member }

/** パスキーと外部クライアントのアクセスを管理する。 */
export function AccountPanel(props: Props) {
  const name = useState("")
  const profileName = useState(props.viewer.name)
  const rename = useMutation({
    mutationFn: () => chatClient.renameProfile(profileName[0]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] })
      await queryClient.invalidateQueries({ queryKey: ["members"] })
    },
  })
  const issuedToken = useState<string | null>(null)
  const copied = useState(false)
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => chatClient.tokens() })
  const passkeys = useQuery({ queryKey: ["passkeys"], queryFn: () => chatClient.passkeys() })
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tokens"] })
      await queryClient.invalidateQueries({ queryKey: ["passkeys"] })
    },
  })

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">{props.viewer.email}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          rename.mutate()
        }}
      >
        <FieldGroup>
          <Field data-invalid={!!rename.error}>
            <FieldLabel htmlFor="profile-name">表示名</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="profile-name"
                value={profileName[0]}
                onChange={(event) => {
                  profileName[1](event.target.value)
                  rename.reset()
                }}
                disabled={rename.isPending}
                required
                maxLength={80}
                aria-invalid={!!rename.error}
              />
              <Button type="submit" disabled={rename.isPending || !profileName[0].trim()}>
                保存
              </Button>
            </div>
            {rename.error && (
              <p role="alert" className="text-sm text-destructive">
                {rename.error.message}
              </p>
            )}
            {rename.isSuccess && (
              <p role="status" className="text-sm text-muted-foreground">
                保存しました
              </p>
            )}
          </Field>
        </FieldGroup>
      </form>
      {(mutation.error || tokens.error || passkeys.error) && (
        <Alert variant="destructive">
          <AlertDescription>
            {mutation.error?.message ?? tokens.error?.message ?? passkeys.error?.message}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">パスキー</h3>
        {passkeys.data?.map((passkey) => (
          <div key={passkey.id} className="flex items-center justify-between gap-2 text-sm">
            <span>登録日 {new Date(passkey.createdAt).toLocaleDateString("ja-JP")}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={mutation.isPending || passkeys.data.length <= 1}
              onClick={() =>
                mutation.mutate(async () => {
                  await passkeyAction("reauth", `delete-passkey:${passkey.id}`)
                  await chatClient.deletePasskey(passkey.id)
                })
              }
            >
              削除
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(async () => {
              await passkeyAction("reauth", "add-passkey")
              await passkeyAction("register", props.viewer.name)
            })
          }
        >
          パスキーを追加
        </Button>
      </div>
      <Separator />
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate(async () => {
            await passkeyAction("reauth", "issue-token")
            const token = await chatClient.issueToken(name[0])
            issuedToken[1](token.token)
            copied[1](false)
            name[1]("")
          })
        }}
      >
        <FieldGroup>
          <Field className="gap-2">
            <FieldLabel htmlFor="token-name">CLI / MCP トークン · 30日間</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="token-name"
                placeholder="端末名"
                value={name[0]}
                required
                maxLength={80}
                onChange={(event) => name[1](event.target.value)}
              />
              <Button type="submit" disabled={mutation.isPending}>
                発行
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </form>
      {issuedToken[0] && (
        <div className="grid gap-2">
          <Label htmlFor="issued-token">一度だけ表示されます</Label>
          <Input id="issued-token" readOnly value={issuedToken[0]} className="font-mono text-xs" />
          <Button
            variant="outline"
            onClick={() => {
              const token = issuedToken[0]
              if (token)
                mutation.mutate(async () => {
                  await navigator.clipboard.writeText(token)
                  copied[1](true)
                })
            }}
          >
            {copied[0] ? "コピー済み" : "コピー"}
          </Button>
        </div>
      )}
      {tokens.data?.map((token) => (
        <div key={token.id} className="flex items-center justify-between gap-2 text-sm">
          <span>
            {token.name}
            <span className="ml-2 text-xs text-muted-foreground">
              {new Date(token.expiresAt).toLocaleDateString("ja-JP")}まで
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(() => chatClient.revokeToken(token.id))}
          >
            失効
          </Button>
        </div>
      ))}
      <Separator />
      <Button
        variant="ghost"
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate(async () => {
            await chatClient.logout()
            queryClient.clear()
            location.assign("/")
          })
        }
      >
        ログアウト
      </Button>
    </div>
  )
}
