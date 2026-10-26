import { env } from "void/env"
import { getCookie } from "hono/cookie"
import { z } from "zod"
import type { Context } from "hono"
import type { AppEnvironment } from "@/api/app-environment"
import { SessionRepository } from "@/contexts/identity/infrastructure/repositories/session.repository"
import { MemberRepository } from "@/contexts/membership/infrastructure/repositories/member.repository"
import { hashSecret } from "@/contexts/identity/infrastructure/adapters/hash-secret"
import type { RegistrationClaim } from "@/contexts/identity/domain/registration-claim"

export async function resolveRegistrationClaim(
  context: Context<AppEnvironment>,
): Promise<RegistrationClaim | Error> {
  const input = z
    .strictObject({
      name: z.string().trim().min(1).max(80),
      invitation: z.string().max(128).nullable(),
      bootstrap: z.string().max(128).nullable(),
    })
    .parse(await context.req.json())
  const browserToken = getCookie(context, "void_chat_session")
  const session = browserToken
    ? await new SessionRepository({ database: context.env.DB }).findOne(browserToken, "browser")
    : null
  const member = session
    ? await new MemberRepository({ database: context.env.DB }).findOne(session.memberId)
    : null

  if (member?.status === "active" && session) {
    const confirmed = await context.env.DB.prepare(
      "UPDATE chat_sessions SET name = 'Browser' WHERE hash = ? AND name = 'add-passkey' AND created_at > ? RETURNING hash",
    )
      .bind(session.hash, Date.now() - 120_000)
      .first()

    if (!confirmed) return new Error("パスキーで本人確認してください")

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      role: "member",
      existing: true,
      inviteHash: null,
      sessionHash: session.hash,
    }
  }

  const hash = await hashSecret(input.invitation ?? "")
  const invitation = await context.env.DB.prepare(
    "SELECT i.email FROM chat_invitations i JOIN chat_members m ON m.id = i.invited_by WHERE i.hash = ? AND i.state = 'pending' AND i.expires_at > ? AND m.status = 'active' AND m.role IN ('owner', 'admin')",
  )
    .bind(hash, Date.now())
    .first<{ email: string }>()

  if (invitation)
    return {
      id: crypto.randomUUID(),
      email: invitation.email,
      name: input.name,
      role: "member",
      existing: false,
      inviteHash: hash,
      sessionHash: null,
    }

  const owner = await context.env.DB.prepare("SELECT id FROM chat_bootstrap_claims LIMIT 1").first()

  if (
    !owner &&
    env.BOOTSTRAP_TOKEN &&
    input.bootstrap &&
    (await hashSecret(input.bootstrap)) === (await hashSecret(env.BOOTSTRAP_TOKEN))
  ) {
    return {
      id: crypto.randomUUID(),
      email: env.ADMIN_EMAIL,
      name: input.name,
      role: "owner",
      existing: false,
      inviteHash: null,
      sessionHash: null,
    }
  }

  return new Error("招待が無効、期限切れ、または使用済みです")
}
