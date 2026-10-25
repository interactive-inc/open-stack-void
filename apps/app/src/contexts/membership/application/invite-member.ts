import type { Member } from "@/contexts/membership/domain/member"
import type { InvitationRepository } from "@/contexts/membership/infrastructure/repositories/invitation.repository"
import type { InvitationMailAdapter } from "@/contexts/membership/infrastructure/adapters/invitation-mail.adapter"

type Context = Readonly<{
  invitations: Pick<InvitationRepository, "create" | "delete">
  mail: Pick<InvitationMailAdapter, "send">
}>

/** メンバーをメールで招待する。 */
export class InviteMember {
  constructor(private readonly context: Context) {}

  async execute(
    actor: Member,
    invitation: { id: string; hash: string; email: string; expiresAt: number; link: string },
  ) {
    if (actor.status !== "active" || actor.role === "member")
      return new Error("管理者権限が必要です")

    await this.context.invitations.create({ ...invitation, invitedBy: actor.id })

    const failure = await this.context.mail.send(invitation.email, invitation.link)

    if (failure) {
      await this.context.invitations.delete(invitation.id)
      return failure
    }

    return { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt }
  }
}
