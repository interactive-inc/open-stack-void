import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { passkeyAction } from "@/client/passkey-action"
import { queryClient } from "@/client/query-client"
import { z } from "zod"

/** パスキーで参加・ログインする。 */
export function LoginScreen() {
  const name = useState("")
  const initializationKey = useState("")
  const registration = useState(false)
  const status = useQuery({
    queryKey: ["auth-status"],
    queryFn: async () => {
      const response = await fetch("/api/auth/status")
      if (!response.ok) throw new Error("ログイン状態を確認できません")
      return z.object({ canBootstrap: z.boolean() }).parse(await response.json())
    },
  })
  const detectRegistration = useState(() => () => {
    registration[1](Boolean(new URLSearchParams(location.hash.slice(1)).get("invite")))
  })
  const canRegister = registration[0] || status.data?.canBootstrap === true
  const login = useMutation({
    mutationFn: () =>
      passkeyAction(canRegister ? "register" : "login", name[0], initializationKey[0] || null),
    onSuccess: async () => {
      initializationKey[1]("")
      await queryClient.invalidateQueries({ queryKey: ["me"] })
      await queryClient.invalidateQueries({ queryKey: ["auth-status"] })
    },
  })

  return (
    <main className="grid min-h-dvh place-items-center p-6" ref={detectRegistration[0]}>
      <form
        className="grid w-full max-w-72 gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          login.mutate()
        }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">
          Void Chat<span className="text-muted-foreground">.</span>
        </h1>
        <FieldGroup>
          {canRegister && (
            <Field>
              <FieldLabel htmlFor="name">名前</FieldLabel>
              <Input
                id="name"
                value={name[0]}
                onChange={(event) => name[1](event.target.value)}
                required
                maxLength={80}
                autoComplete="name"
              />
            </Field>
          )}
          {status.data?.canBootstrap && !registration[0] && (
            <Field>
              <FieldLabel htmlFor="initialization-key">初期化キー</FieldLabel>
              <Input
                id="initialization-key"
                type="password"
                value={initializationKey[0]}
                onChange={(event) => initializationKey[1](event.target.value)}
                required
                maxLength={128}
                autoComplete="off"
              />
            </Field>
          )}
        </FieldGroup>
        <Button type="submit" disabled={login.isPending || status.isPending || status.isError}>
          {login.isPending ? "確認中…" : canRegister ? "パスキーを登録" : "パスキーでログイン"}
        </Button>
        {(login.error || status.error) && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>
                {status.error
                  ? "ログイン状態を確認できません。再試行してください"
                  : login.error?.message}
              </span>
              {status.error && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={status.isFetching}
                  onClick={() => void status.refetch()}
                >
                  再試行
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </form>
    </main>
  )
}
