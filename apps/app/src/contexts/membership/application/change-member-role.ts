import { authorizeMemberChange } from "@/contexts/membership/domain/authorize-member-change"
import type { Member } from "@/contexts/membership/domain/member"
import type { MemberRepository } from "@/contexts/membership/infrastructure/repositories/member.repository"

type Context = Readonly<{ members: Pick<MemberRepository, "findOne" | "write"> }>

/** メンバーの役割を変更する。 */
export class ChangeMemberRole {
  constructor(private readonly context: Context) {}

  async execute(actor: Member, targetId: string, role: "admin" | "member") {
    const target = await this.context.members.findOne(targetId)

    if (!target) return new Error("メンバーが見つかりません")

    const rejection = authorizeMemberChange(actor, target, role)

    if (rejection) return rejection

    return this.context.members.write({ ...target, role })
  }
}
