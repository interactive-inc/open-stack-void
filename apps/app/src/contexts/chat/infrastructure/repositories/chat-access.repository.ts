import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"

export class ChatAccessRepository {
  constructor(private readonly database: D1Database) {}

  async findOne(channelId: string, principal: ChatPrincipal) {
    return this.database
      .prepare(`SELECT m.name AS memberName, m.role, c.archived
      FROM chat_sessions s JOIN chat_members m ON m.id = s.member_id
      JOIN chat_channels c ON c.id = ?
      WHERE s.hash = ? AND s.member_id = ? AND s.kind = ? AND s.expires_at > ?
      AND m.status = 'active' AND m.role IN ('owner', 'admin', 'member')`)
      .bind(channelId, principal.sessionHash, principal.memberId, principal.kind, Date.now())
      .first<{ memberName: string; role: string; archived: number }>()
  }
}
