import { useMutation, useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { passkeyAction } from "@/client/passkey-action"
import { useState } from "react"

type Props = { requestId: string }

/** 接続元と確認コードを確かめてパスキーで承認する。 */
export function AuthorizationScreen(props: Props) {
  const code = useState("")
  const request = useQuery({
    queryKey: ["authorization", props.requestId],
    queryFn: async () =>
      z
        .object({ name: z.string(), expiresAt: z.number(), status: z.string() })
        .parse(await (await fetch(`/api/device/${encodeURIComponent(props.requestId)}`)).json()),
  })
  const approval = useMutation({
    mutationFn: async (approve: boolean) => {
      await passkeyAction("reauth", `device:${props.requestId}`)
      const response = await fetch(`/api/device/${encodeURIComponent(props.requestId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code[0], approve }),
      })
      if (!response.ok) {
        const failure = z.object({ error: z.string() }).parse(await response.json())
        throw new Error(failure.error)
      }
    },
  })

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="grid w-full max-w-sm gap-5">
        <h1 className="text-xl font-semibold">
          {approval.isSuccess ? "完了" : `${request.data?.name ?? "MCP"} の接続を承認`}
        </h1>
        {!approval.isSuccess && (
          <>
            <p className="text-sm text-muted-foreground">
              開始した接続に表示されたコードを入力してください。
            </p>
            <FieldGroup>
              <Field className="gap-2">
                <FieldLabel htmlFor="approval-code">確認コード</FieldLabel>
                <Input
                  id="approval-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  value={code[0]}
                  maxLength={6}
                  onChange={(event) => code[1](event.target.value)}
                  autoComplete="off"
                />
              </Field>
            </FieldGroup>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={approval.isPending || code[0].length !== 6 || request.isError}
                onClick={() => approval.mutate(true)}
              >
                パスキーで承認
              </Button>
              <Button
                variant="outline"
                disabled={approval.isPending || code[0].length !== 6}
                onClick={() => approval.mutate(false)}
              >
                拒否
              </Button>
            </div>
          </>
        )}
        {(approval.error || request.error) && (
          <Alert variant="destructive">
            <AlertDescription>
              {approval.error?.message ?? "承認リクエストが無効または期限切れです"}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  )
}
