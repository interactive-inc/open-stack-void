import { Hono } from "hono"
import { z } from "zod"
import { env } from "void/env"
import type { AppEnvironment } from "@/api/app-environment"
import { authenticate } from "@/contexts/identity/interface/authenticate"
import { MemberRepository } from "@/contexts/membership/infrastructure/repositories/member.repository"
import { InvitationRepository } from "@/contexts/membership/infrastructure/repositories/invitation.repository"
import { InvitationMailAdapter } from "@/contexts/membership/infrastructure/adapters/invitation-mail.adapter"
import { ChangeMemberRole } from "@/contexts/membership/application/change-member-role"
import { DisableMember } from "@/contexts/membership/application/disable-member"
import { RestoreMember } from "@/contexts/membership/application/restore-member"
import { InviteMember } from "@/contexts/membership/application/invite-member"
import { createSecret } from "@/contexts/identity/infrastructure/adapters/create-secret"
import { hashSecret } from "@/contexts/identity/infrastructure/adapters/hash-secret"

export const membershipRoutes = new Hono<AppEnvironment>()

membershipRoutes.use("*", authenticate)

membershipRoutes.get("/members", async (context) =>
  context.json(await new MemberRepository({ database: context.env.DB }).findMany()),
)

membershipRoutes.post("/members/:id/restore", async (context) => {
  const member = await new RestoreMember({
    members: new MemberRepository({ database: context.env.DB }),
  }).execute(context.get("member"), context.req.param("id"))

  if (member instanceof Error) return context.json({ error: member.message }, 403)

  return context.json(member)
})

membershipRoutes.patch("/members/:id", async (context) => {
  const input = z.object({ role: z.enum(["admin", "member"]) }).parse(await context.req.json())
  const member = await new ChangeMemberRole({
    members: new MemberRepository({ database: context.env.DB }),
  }).execute(context.get("member"), context.req.param("id"), input.role)

  if (member instanceof Error) return context.json({ error: member.message }, 403)

  return context.json(member)
})

membershipRoutes.delete("/members/:id", async (context) => {
  const member = await new DisableMember({
    members: new MemberRepository({ database: context.env.DB }),
  }).execute(context.get("member"), context.req.param("id"))

  if (member instanceof Error) return context.json({ error: member.message }, 403)

  await context.env.DB.prepare("DELETE FROM chat_sessions WHERE member_id = ?")
    .bind(member.id)
    .run()

  return context.json(member)
})

membershipRoutes.get("/invitations", async (context) => {
  if (context.get("member").role === "member")
    return context.json({ error: "管理者権限が必要です" }, 403)

  return context.json(await new InvitationRepository({ database: context.env.DB }).findMany())
})

membershipRoutes.post("/invitations", async (context) => {
  const input = z
    .object({
      email: z
        .email()
        .max(254)
        .transform((email) => email.toLowerCase()),
    })
    .parse(await context.req.json())
  const existing = await context.env.DB.prepare("SELECT id FROM chat_members WHERE email = ?")
    .bind(input.email)
    .first()

  if (existing) return context.json({ error: "登録済みのメールアドレスです" }, 409)

  const token = createSecret()
  const invitation = await new InviteMember({
    invitations: new InvitationRepository({ database: context.env.DB }),
    mail: new InvitationMailAdapter(),
  }).execute(context.get("member"), {
    id: crypto.randomUUID(),
    hash: await hashSecret(token),
    email: input.email,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    link: `${env.APP_ORIGIN}/#invite=${token}`,
  })

  if (invitation instanceof Error) return context.json({ error: invitation.message }, 400)

  return context.json(invitation, 201)
})

membershipRoutes.delete("/invitations/:id", async (context) => {
  if (context.get("member").role === "member")
    return context.json({ error: "管理者権限が必要です" }, 403)

  await new InvitationRepository({ database: context.env.DB }).delete(context.req.param("id"))

  return context.json({ ok: true })
})
