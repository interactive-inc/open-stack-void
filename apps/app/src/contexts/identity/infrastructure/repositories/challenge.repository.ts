import { createSecret } from "@/contexts/identity/infrastructure/adapters/create-secret"

type Context = Readonly<{ database: D1Database }>

export class ChallengeRepository {
  constructor(private readonly context: Context) {}

  async create(challenge: string, kind: string, payload: string) {
    const id = createSecret()

    await this.context.database
      .prepare("DELETE FROM chat_challenges WHERE expires_at <= ?")
      .bind(Date.now())
      .run()
    await this.context.database
      .prepare(
        "INSERT INTO chat_challenges (id, challenge, kind, payload, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(id, challenge, kind, payload, Date.now() + 300_000)
      .run()

    return id
  }

  async consume(id: string, kind: string) {
    return this.context.database
      .prepare(
        "DELETE FROM chat_challenges WHERE id = ? AND kind = ? AND expires_at > ? RETURNING challenge, payload",
      )
      .bind(id, kind, Date.now())
      .first<{ challenge: string; payload: string }>()
  }
}
