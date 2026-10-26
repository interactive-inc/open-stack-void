import { invitationSchema } from "@/contexts/membership/domain/invitation"
import { InvitationFailed } from "@/contexts/membership/domain/invitation-failed"

type Context = Readonly<{ database: D1Database }>

export class InvitationRepository {
  constructor(private readonly context: Context) {}

  async create(invitation: {
    id: string
    hash: string
    email: string
    invitedBy: string
    expiresAt: number
  }) {
    const database = this.context.database
    const now = Date.now()
    const writes = await database.batch([
      database
        .prepare(
          "SELECT id FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin')",
        )
        .bind(invitation.invitedBy),
      database
        .prepare(
          "INSERT OR IGNORE INTO chat_invitations (id, hash, email, invited_by, expires_at, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin')) AND NOT EXISTS (SELECT 1 FROM chat_members WHERE lower(email) = ?) AND NOT EXISTS (SELECT 1 FROM chat_invitations WHERE lower(email) = ? AND state = 'pending' AND expires_at > ?)",
        )
        .bind(
          invitation.id,
          invitation.hash,
          invitation.email,
          invitation.invitedBy,
          invitation.expiresAt,
          now,
          invitation.invitedBy,
          invitation.email,
          invitation.email,
          now,
        ),
      database
        .prepare(
          "SELECT id, email, expires_at AS expiresAt, 'pending' AS status FROM chat_invitations WHERE id = ? AND email = ? AND invited_by = ? AND state = 'pending' AND expires_at > ?",
        )
        .bind(invitation.id, invitation.email, invitation.invitedBy, now),
      database.prepare("SELECT id FROM chat_members WHERE lower(email) = ?").bind(invitation.email),
      database.prepare("SELECT id FROM chat_invitations WHERE id = ?").bind(invitation.id),
    ])
    if (!writes[0].results.length) return new InvitationFailed("forbidden")
    if (writes[3].results.length) return new InvitationFailed("registered")
    if (!writes[2].results.length)
      return new InvitationFailed(writes[4].results.length ? "used" : "conflict")
    return {
      created: writes[1].meta.changes === 1,
      invitation: invitationSchema.parse(writes[2].results[0]),
    }
  }

  async findMany(actorId: string) {
    const database = this.context.database
    const reads = await database.batch([
      database
        .prepare(
          "SELECT id FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin')",
        )
        .bind(actorId),
      database
        .prepare(
          "SELECT i.id, i.email, i.expires_at AS expiresAt, CASE WHEN i.state = 'revoked' THEN 'revoked' WHEN i.state = 'accepted' THEN 'accepted' WHEN i.state != 'pending' THEN 'unavailable' WHEN i.expires_at <= ? THEN 'expired' WHEN m.status != 'active' OR m.role NOT IN ('owner', 'admin') THEN 'unavailable' ELSE 'pending' END AS status FROM chat_invitations i JOIN chat_members m ON m.id = i.invited_by ORDER BY (i.expires_at > ?) DESC, i.created_at DESC LIMIT 100",
        )
        .bind(Date.now(), Date.now()),
    ])

    if (!reads[0].results.length) return new InvitationFailed("forbidden")
    return reads[1].results.map((invitation) => invitationSchema.parse(invitation))
  }

  async revoke(actorId: string, id: string) {
    const database = this.context.database
    const writes = await database.batch([
      database
        .prepare(
          "SELECT id FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin')",
        )
        .bind(actorId),
      database
        .prepare(
          "UPDATE chat_invitations SET state = 'revoked', expires_at = 0 WHERE id = ? AND state = 'pending' AND EXISTS (SELECT 1 FROM chat_members WHERE id = ? AND status = 'active' AND role IN ('owner', 'admin'))",
        )
        .bind(id, actorId),
    ])
    return writes[0].results.length === 1
  }

  async revokeUndelivered(id: string) {
    await this.context.database
      .prepare(
        "UPDATE chat_invitations SET state = 'revoked', expires_at = 0 WHERE id = ? AND state = 'pending'",
      )
      .bind(id)
      .run()
  }
}
