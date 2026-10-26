import { memberSchema } from "@/contexts/membership/domain/member"

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

  async changeRole(actorId: string, memberId: string, role: "admin" | "member") {
    const member = await this.context.database
      .prepare(
        "UPDATE chat_members SET role = ? WHERE id = ? AND id != ? AND role != 'owner' AND EXISTS (SELECT 1 FROM chat_members actor WHERE actor.id = ? AND actor.status = 'active' AND actor.role = 'owner') RETURNING id, email, name, role, status, created_at AS createdAt",
      )
      .bind(role, memberId, actorId, actorId)
      .first()
    return member ? memberSchema.parse(member) : null
  }

  async setStatus(actorId: string, memberId: string, status: "active" | "disabled") {
    const member = await this.context.database
      .prepare(
        "UPDATE chat_members SET status = ? WHERE id = ? AND id != ? AND role != 'owner' AND EXISTS (SELECT 1 FROM chat_members actor WHERE actor.id = ? AND actor.status = 'active' AND (actor.role = 'owner' OR (actor.role = 'admin' AND chat_members.role = 'member'))) RETURNING id, email, name, role, status, created_at AS createdAt",
      )
      .bind(status, memberId, actorId, actorId)
      .first()
    return member ? memberSchema.parse(member) : null
  }
}
