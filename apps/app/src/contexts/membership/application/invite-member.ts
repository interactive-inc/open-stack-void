import type { Member } from "@/contexts/membership/domain/member"
import type { InvitationRepository } from "@/contexts/membership/infrastructure/repositories/invitation.repository"
import { InvitationFailed } from "@/contexts/membership/domain/invitation-failed"

type Context = Readonly<{ invitations: Pick<InvitationRepository, "create"> }>

/** 招待と配信意図を同じ書込みで確定する。 */
export class InviteMember {
  constructor(private readonly context: Context) {}

  async execute(
    actor: Member,
    invitation: { id: string; hash: string; email: string; expiresAt: number },
  ) {
    if (actor.status !== "active" || actor.role === "member")
      return new InvitationFailed("forbidden")
    return this.context.invitations.create({ ...invitation, invitedBy: actor.id })
  }
}
