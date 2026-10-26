import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { chatClient } from "@/client/chat-client"
import { queryClient } from "@/client/query-client"
import type { Member } from "@open-stack/sdk/contracts"

type Props = { viewer: Member }
const invitationLabels = {
  pending: "招待中",
  expired: "期限切れ",
  unavailable: "招待者の権限なし",
  revoked: "取消済み",
  accepted: "受諾済み",
}

/** メンバーと招待を管理する。 */
export function MembersPanel(props: Props) {
  const email = useState("")
  const attempt = useState<{ email: string; id: string } | null>(null)
  const removal = useState<Member | null>(null)
  const members = useQuery({ queryKey: ["members"], queryFn: () => chatClient.members() })
  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: () => chatClient.invitations(),
    enabled: props.viewer.role !== "member",
    refetchInterval: 30_000,
  })
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      removal[1](null)
      await queryClient.invalidateQueries({ queryKey: ["members"] })
      await queryClient.invalidateQueries({ queryKey: ["invitations"] })
    },
  })
  const invite = useMutation({
    mutationFn: (request: { email: string; id: string }) =>
      chatClient.invite(request.email, request.id),
    onSuccess: async () => {
      email[1]("")
      attempt[1](null)
      await queryClient.invalidateQueries({ queryKey: ["invitations"] })
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invitations"] })
    },
  })

  return (
    <div className="grid gap-5">
      {props.viewer.role !== "member" && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const normalized = email[0].trim().toLowerCase()
            const request =
              attempt[0]?.email === normalized
                ? attempt[0]
                : { email: normalized, id: crypto.randomUUID() }
            attempt[1](request)
            invite.mutate(request)
          }}
        >
          <FieldGroup className="flex-row items-end gap-2">
            <Field className="flex-1 gap-2">
              <FieldLabel htmlFor="invite-email">メールで招待</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                placeholder="you@example.com"
                value={email[0]}
                onChange={(event) => email[1](event.target.value)}
                required
                maxLength={254}
                disabled={invite.isPending}
              />
            </Field>
            <Button type="submit" disabled={invite.isPending}>
              招待
            </Button>
          </FieldGroup>
        </form>
      )}
      {(invite.error || mutation.error || members.error || invitations.error) && (
        <Alert variant="destructive">
          <AlertDescription>
            {invite.error instanceof TypeError
              ? "送信結果を確認できません。一覧を確認し、同じ内容で再試行してください"
              : (invite.error?.message ??
                mutation.error?.message ??
                members.error?.message ??
                invitations.error?.message)}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void members.refetch()
                if (props.viewer.role !== "member") void invitations.refetch()
                void queryClient.invalidateQueries({ queryKey: ["me"] })
              }}
            >
              再読み込み
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>メンバー</TableHead>
            <TableHead>役割</TableHead>
            <TableHead>
              <span className="sr-only">操作</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.data?.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <p className="font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
              </TableCell>
              <TableCell>
                {member.status === "disabled" ? (
                  "停止中"
                ) : props.viewer.role === "owner" && member.role !== "owner" ? (
                  <NativeSelect
                    aria-label={`${member.name} の役割`}
                    value={member.role}
                    disabled={mutation.isPending}
                    onChange={(event) => {
                      const role = event.target.value
                      if (role === "admin" || role === "member")
                        mutation.mutate(() => chatClient.changeRole(member.id, role))
                    }}
                  >
                    <NativeSelectOption value="member">メンバー</NativeSelectOption>
                    <NativeSelectOption value="admin">管理者</NativeSelectOption>
                  </NativeSelect>
                ) : member.role === "owner" ? (
                  "所有者"
                ) : member.role === "admin" ? (
                  "管理者"
                ) : (
                  "メンバー"
                )}
              </TableCell>
              <TableCell>
                {member.role !== "owner" &&
                  member.id !== props.viewer.id &&
                  (props.viewer.role === "owner" ||
                    (props.viewer.role === "admin" && member.role === "member")) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (member.status === "disabled")
                          mutation.mutate(() => chatClient.restoreMember(member.id))
                        else removal[1](member)
                      }}
                    >
                      {member.status === "disabled" ? "再開" : "停止"}
                    </Button>
                  )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {(props.viewer.role !== "member" && !invitations.isError ? invitations.data : [])?.map(
        (invitation) => (
          <div
            key={invitation.id}
            role="group"
            aria-label={`招待 ${invitation.email}`}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <div className="min-w-0">
              <span className="block truncate text-muted-foreground">
                {invitation.email} · {invitationLabels[invitation.status]}
              </span>
              {!["revoked", "accepted"].includes(invitation.status) && (
                <time
                  dateTime={new Date(invitation.expiresAt).toISOString()}
                  className="text-xs text-muted-foreground"
                >
                  期限 {new Date(invitation.expiresAt).toLocaleDateString("ja-JP")}
                </time>
              )}
            </div>
            {invitation.status === "revoked" ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={mutation.isPending || invite.isPending}
                onClick={() => {
                  email[1](invitation.email)
                  attempt[1](null)
                  invite.reset()
                }}
              >
                再招待
              </Button>
            ) : (
              invitation.status !== "accepted" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate(async () => {
                      await chatClient.revokeInvitation(invitation.id)
                      if (attempt[0]?.email === invitation.email) attempt[1](null)
                    })
                  }
                >
                  取消
                </Button>
              )
            )}
          </div>
        ),
      )}
      <AlertDialog
        open={removal[0] !== null}
        onOpenChange={(open) => {
          if (!open) removal[1](null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removal[0]?.name} を停止しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              Web・CLI・MCP からアクセスできなくなります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>戻る</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={() => {
                const member = removal[0]
                if (member) mutation.mutate(() => chatClient.disableMember(member.id))
              }}
            >
              停止
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
