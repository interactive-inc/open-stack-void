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
    await this.context.database
      .prepare(
        "INSERT INTO chat_invitations (id, hash, email, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        invitation.id,
        invitation.hash,
        invitation.email,
        invitation.invitedBy,
        invitation.expiresAt,
        Date.now(),
      )
      .run()

    return invitation
  }

  async findMany() {
    const invitations = await this.context.database
      .prepare(
        "SELECT id, email, expires_at AS expiresAt, created_at AS createdAt FROM chat_invitations WHERE expires_at > ? ORDER BY created_at DESC",
      )
      .bind(Date.now())
      .all<{ id: string; email: string; expiresAt: number; createdAt: number }>()

    return invitations.results
  }

  async delete(id: string) {
    await this.context.database.prepare("DELETE FROM chat_invitations WHERE id = ?").bind(id).run()
  }
}
