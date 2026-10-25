import { hashSecret } from "@/contexts/identity/infrastructure/adapters/hash-secret"
import { createSecret } from "@/contexts/identity/infrastructure/adapters/create-secret"

type Context = Readonly<{ database: D1Database }>

export class SessionRepository {
  constructor(private readonly context: Context) {}

  async create(memberId: string, kind: "browser" | "token", name: string) {
    const token = createSecret()
    const hash = await hashSecret(token)
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30

    await this.context.database
      .prepare("DELETE FROM chat_sessions WHERE expires_at <= ?")
      .bind(Date.now())
      .run()

    await this.context.database
      .prepare(
        "INSERT INTO chat_sessions (hash, member_id, kind, name, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(hash, memberId, kind, name, expiresAt, Date.now())
      .run()

    return { token, hash, expiresAt }
  }

  async findOne(token: string, kind: "browser" | "token") {
    const hash = await hashSecret(token)

    return this.context.database
      .prepare(
        "SELECT hash, member_id AS memberId, kind FROM chat_sessions WHERE hash = ? AND kind = ? AND expires_at > ?",
      )
      .bind(hash, kind, Date.now())
      .first<{ hash: string; memberId: string; kind: string }>()
  }
}
