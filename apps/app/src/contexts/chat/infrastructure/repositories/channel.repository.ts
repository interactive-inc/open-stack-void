import { channelSchema } from "@/contexts/chat/domain/channel"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"

type Context = Readonly<{ database: D1Database }>

const manager = `EXISTS (SELECT 1 FROM chat_sessions s JOIN chat_members m ON m.id = s.member_id
  WHERE s.hash = ? AND s.member_id = ? AND s.kind = ? AND s.expires_at > ?
  AND m.status = 'active' AND m.role IN ('owner', 'admin'))`

export class ChannelRepository {
  constructor(private readonly context: Context) {}

  async findOne(id: string) {
    const row = await this.context.database
      .prepare("SELECT id, name, archived FROM chat_channels WHERE id = ?")
      .bind(id)
      .first()
    return row ? channelSchema.parse(row) : null
  }

  async findMany() {
    const channels = await this.context.database
      .prepare("SELECT id, name, archived FROM chat_channels ORDER BY archived, created_at, id")
      .all()

    return channelSchema.array().parse(channels.results)
  }

  async create(principal: ChatPrincipal, input: { id: string; name: string }) {
    const auth = [principal.sessionHash, principal.memberId, principal.kind, Date.now()]
    const result = await this.context.database.batch([
      this.context.database.prepare(`SELECT 1 WHERE ${manager}`).bind(...auth),
      this.context.database
        .prepare(`INSERT OR IGNORE INTO chat_channels (id, name, created_by, created_at)
        SELECT ?, ?, ?, ? WHERE ${manager}`)
        .bind(input.id, input.name, principal.memberId, Date.now(), ...auth),
      this.context.database
        .prepare(
          "SELECT id, name, archived FROM chat_channels WHERE id = ? AND name = ? AND created_by = ?",
        )
        .bind(input.id, input.name, principal.memberId),
    ])
    if (!result[0]?.results.length) return new ChatFailed("forbidden")
    const row = result[2]?.results[0]
    return row ? channelSchema.parse(row) : new ChatFailed("conflict")
  }

  async rename(principal: ChatPrincipal, id: string, name: string) {
    try {
      const row = await this.context.database
        .prepare(
          `UPDATE chat_channels SET name = ? WHERE id = ? AND ${manager} RETURNING id, name, archived`,
        )
        .bind(name, id, principal.sessionHash, principal.memberId, principal.kind, Date.now())
        .first()
      return row ? channelSchema.parse(row) : new ChatFailed("forbidden")
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed: chat_channels.name")
      )
        return new ChatFailed("conflict")
      throw error
    }
  }

  async setArchived(principal: ChatPrincipal, id: string, archived: boolean) {
    const row = await this.context.database
      .prepare(
        `UPDATE chat_channels SET archived = ? WHERE id = ? AND ${manager} RETURNING id, name, archived`,
      )
      .bind(
        archived ? 1 : 0,
        id,
        principal.sessionHash,
        principal.memberId,
        principal.kind,
        Date.now(),
      )
      .first()
    return row ? channelSchema.parse(row) : new ChatFailed("forbidden")
  }
}
