import { MemberChangeFailed } from "@/contexts/membership/domain/member-change-failed"
import { authorizeMemberChange } from "@/contexts/membership/domain/authorize-member-change"
import type { Member } from "@/contexts/membership/domain/member"
import type { MemberRepository } from "@/contexts/membership/infrastructure/repositories/member.repository"

type Context = Readonly<{ members: Pick<MemberRepository, "findOne" | "setStatus"> }>

/** メンバーのアクセスを停止する。 */
export class DisableMember {
  constructor(private readonly context: Context) {}

  async execute(actor: Member, targetId: string) {
    const target = await this.context.members.findOne(targetId)

    if (!target) return new MemberChangeFailed("missing")

    const rejection = authorizeMemberChange(actor, target, null)

    if (rejection) return rejection

    const updated = await this.context.members.setStatus(actor.id, target.id, "disabled")
    return updated ?? new MemberChangeFailed("changed")
  }
}
