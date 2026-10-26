import { memberSchema } from "@/contexts/membership/domain/member"
import type { Member } from "@/contexts/membership/domain/member"
import { ProfileUpdateFailed } from "@/contexts/membership/domain/profile-update-failed"
import type { MemberRepository } from "@/contexts/membership/infrastructure/repositories/member.repository"

type Props = Readonly<{ members: Pick<MemberRepository, "renameProfile"> }>

/** 自分の表示名を変更する。 */
export class RenameProfile {
  constructor(private readonly props: Props) {}

  async execute(actor: Member, name: string) {
    if (actor.status !== "active") return new ProfileUpdateFailed("inactive")
    const parsed = memberSchema.shape.name.safeParse(name.trim())
    if (!parsed.success) return new ProfileUpdateFailed("invalid-name")
    const member = await this.props.members.renameProfile(actor.id, parsed.data)
    if (!member) return new ProfileUpdateFailed("unavailable")
    return member
  }
}
