import type { Member } from "@/contexts/membership/domain/member"
import type { InvitationRepository } from "@/contexts/membership/infrastructure/repositories/invitation.repository"
import type { InvitationMailAdapter } from "@/contexts/membership/infrastructure/adapters/invitation-mail.adapter"
import { InvitationFailed } from "@/contexts/membership/domain/invitation-failed"

type Context = Readonly<{
  invitations: Pick<InvitationRepository, "create" | "revokeUndelivered">
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
      return new InvitationFailed("forbidden")

    const created = await this.context.invitations.create({ ...invitation, invitedBy: actor.id })
    if (created instanceof InvitationFailed) return created
    if (!created.created) return created.invitation

    const failure = await this.context.mail
      .send(invitation.email, invitation.link)
      .catch(() => new InvitationFailed("delivery"))

    if (failure) {
      await this.context.invitations.revokeUndelivered(invitation.id)
      return new InvitationFailed("delivery")
    }

    return created.invitation
  }
}
