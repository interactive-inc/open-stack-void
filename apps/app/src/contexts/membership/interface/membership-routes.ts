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
import { RevokeInvitation } from "@/contexts/membership/application/revoke-invitation"
import { InvitationFailed } from "@/contexts/membership/domain/invitation-failed"
import { RenameProfile } from "@/contexts/membership/application/rename-profile"
import { ProfileUpdateFailed } from "@/contexts/membership/domain/profile-update-failed"
import { createSecret } from "@/contexts/identity/infrastructure/adapters/create-secret"
import { hashSecret } from "@/contexts/identity/infrastructure/adapters/hash-secret"

export const membershipRoutes = new Hono<AppEnvironment>()

membershipRoutes.use("*", authenticate)

membershipRoutes.patch("/me", async (context) => {
  const input = z.strictObject({ name: z.string() }).parse(await context.req.json())
  const member = await new RenameProfile({
    members: new MemberRepository({ database: context.env.DB }),
  }).execute(context.get("member"), input.name)
  if (member instanceof ProfileUpdateFailed)
    return context.json({ error: member.message }, member.reason === "invalid-name" ? 400 : 403)
  return context.json(member)
})

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
  const input = z
    .strictObject({ role: z.enum(["admin", "member"]) })
    .parse(await context.req.json())
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

  const invitations = await new InvitationRepository({ database: context.env.DB }).findMany(
    context.get("member").id,
  )
  if (invitations instanceof InvitationFailed)
    return context.json({ error: invitations.message }, 403)
  return context.json(invitations)
})

membershipRoutes.post("/invitations", async (context) => {
  const input = z
    .strictObject({
      id: z.uuid().optional(),
      email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    })
    .parse(await context.req.json())
  const token = createSecret()
  const invitation = await new InviteMember({
    invitations: new InvitationRepository({ database: context.env.DB }),
    mail: new InvitationMailAdapter(),
  }).execute(context.get("member"), {
    id: input.id ?? crypto.randomUUID(),
    hash: await hashSecret(token),
    email: input.email,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    link: `${env.APP_ORIGIN}/#invite=${token}`,
  })

  if (invitation instanceof InvitationFailed) {
    const status =
      invitation.reason === "forbidden" ? 403 : invitation.reason === "delivery" ? 503 : 409
    return context.json({ error: invitation.message }, status)
  }

  return context.json(invitation, 201)
})

membershipRoutes.delete("/invitations/:id", async (context) => {
  const outcome = await new RevokeInvitation({
    invitations: new InvitationRepository({ database: context.env.DB }),
  }).execute(context.get("member"), context.req.param("id"))
  if (outcome instanceof InvitationFailed) return context.json({ error: outcome.message }, 403)
  return context.json(outcome)
})
