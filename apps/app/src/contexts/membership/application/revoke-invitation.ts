import type { Member } from "@/contexts/membership/domain/member"
import { InvitationFailed } from "@/contexts/membership/domain/invitation-failed"
import type { InvitationRepository } from "@/contexts/membership/infrastructure/repositories/invitation.repository"

type Props = Readonly<{ invitations: Pick<InvitationRepository, "revoke"> }>

/** 招待を取り消し、既に送ったリンクを無効にする。 */
export class RevokeInvitation {
  constructor(private readonly props: Props) {}

  async execute(actor: Member, id: string) {
    if (actor.status !== "active" || actor.role === "member")
      return new InvitationFailed("forbidden")
    if (!(await this.props.invitations.revoke(actor.id, id)))
      return new InvitationFailed("forbidden")
    return { ok: true }
  }
}
