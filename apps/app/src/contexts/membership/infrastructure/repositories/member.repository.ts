import { memberSchema } from "@/contexts/membership/domain/member"
import type { Member } from "@/contexts/membership/domain/member"

type Context = Readonly<{ database: D1Database }>

export class MemberRepository {
  constructor(private readonly context: Context) {}

  async findOne(id: string) {
    const member = await this.context.database
      .prepare(
        "SELECT id, email, name, role, status, created_at AS createdAt FROM chat_members WHERE id = ?",
      )
      .bind(id)
      .first()

    if (!member) return null

    return memberSchema.parse(member)
  }

  async findMany() {
    const members = await this.context.database
      .prepare(
        "SELECT id, email, name, role, status, created_at AS createdAt FROM chat_members ORDER BY created_at",
      )
      .all()

    return members.results.map((member) => memberSchema.parse(member))
  }

  async renameProfile(memberId: string, name: string) {
    const member = await this.context.database
      .prepare(
        "UPDATE chat_members SET name = ? WHERE id = ? AND status = 'active' RETURNING id, email, name, role, status, created_at AS createdAt",
      )
      .bind(name, memberId)
      .first()
    return member ? memberSchema.parse(member) : null
  }

  async write(member: Member) {
    await this.context.database
      .prepare("UPDATE chat_members SET role = ?, status = ? WHERE id = ? AND role != 'owner'")
      .bind(member.role, member.status, member.id)
      .run()

    return member
  }
}
