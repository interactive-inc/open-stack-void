import type { Attachment } from "@/contexts/chat/domain/attachment"
import { roomAttachmentBytes, roomAttachmentCount } from "@/contexts/chat/domain/attachment-limits"

export class RoomAttachments {
  constructor(private readonly sql: SqlStorage) {}
  static initialize(sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS attachments (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, channelId TEXT NOT NULL, messageId TEXT NOT NULL UNIQUE, memberId TEXT NOT NULL, name TEXT NOT NULL, mediaType TEXT NOT NULL, size INTEGER NOT NULL, digest TEXT NOT NULL, data BLOB NOT NULL, createdAt INTEGER NOT NULL)",
    )
  }
  findOne(channelId: string, id: string) {
    return this.sql
      .exec<Attachment & { digest: string; data: ArrayBuffer }>(
        "SELECT * FROM attachments WHERE channelId = ? AND id = ?",
        channelId,
        id,
      )
      .toArray()[0]
  }
  usage() {
    const usage = this.sql
      .exec<{ files: number; bytes: number }>(
        "SELECT COUNT(*) AS files, COALESCE(SUM(size),0) AS bytes FROM attachments",
      )
      .one()
    return { ...usage, maxFiles: roomAttachmentCount, maxBytes: roomAttachmentBytes }
  }
  forMessage(messageId: string) {
    return this.sql
      .exec<Attachment>(
        "SELECT id, channelId, messageId, memberId, name, mediaType, size, sequence, createdAt FROM attachments WHERE messageId = ?",
        messageId,
      )
      .toArray()
  }
  findMany(channelId: string, before: number) {
    return this.sql
      .exec<Attachment>(
        "SELECT id, channelId, messageId, memberId, name, mediaType, size, sequence, createdAt FROM attachments WHERE channelId = ? AND sequence < ? ORDER BY sequence DESC LIMIT 51",
        channelId,
        before,
      )
      .toArray()
  }
  create(input: Omit<Attachment, "sequence"> & { digest: string; data: ArrayBuffer }) {
    this.sql.exec(
      "INSERT INTO attachments (id, channelId, messageId, memberId, name, mediaType, size, digest, data, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      input.id,
      input.channelId,
      input.messageId,
      input.memberId,
      input.name,
      input.mediaType,
      input.size,
      input.digest,
      input.data,
      input.createdAt,
    )
    return this.forMessage(input.messageId)[0]!
  }
}
