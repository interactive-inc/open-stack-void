import { DurableObject } from "cloudflare:workers"
import { defineDurableObject } from "void/durable"
import type { ChatMessage } from "@/contexts/chat/domain/chat-message"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import { ChatAccessRepository } from "@/contexts/chat/infrastructure/repositories/chat-access.repository"
import { ChannelRepository } from "@/contexts/chat/infrastructure/repositories/channel.repository"
import { RoomAttachments } from "@/contexts/chat/infrastructure/room-attachments"
import { validateAttachment } from "@/contexts/chat/domain/attachment"
import type { AttachmentSubmission } from "@/contexts/chat/domain/attachment"
import { searchSnippet } from "@/contexts/chat/domain/search"

type MessageRow = Omit<ChatMessage, "attachments">

class ChatRoomObject extends DurableObject<{ DB: D1Database }> {
  constructor(state: DurableObjectState, bindings: { DB: D1Database }) {
    super(state, bindings)
    state.setWebSocketAutoResponse()

    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, channelId TEXT NOT NULL, memberId TEXT NOT NULL, memberName TEXT NOT NULL, text TEXT NOT NULL, createdAt INTEGER NOT NULL)",
    )
    RoomAttachments.initialize(state.storage.sql)
  }

  async list(
    channelId: string,
    principal: ChatPrincipal,
    before: number | null,
    after: number | null,
    until: number | null,
  ) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!(await new ChatAccessRepository(this.env.DB).findOne(channelId, principal)))
        return { error: "forbidden" as const }
      if (after !== null)
        return {
          messages: this.ctx.storage.sql
            .exec<MessageRow>(
              "SELECT * FROM messages WHERE sequence > ? AND sequence <= ? ORDER BY sequence LIMIT 100",
              after,
              until ?? Number.MAX_SAFE_INTEGER,
            )
            .toArray()
            .map((message) => this.withAttachments(message)),
        }
      return {
        messages: this.ctx.storage.sql
          .exec<MessageRow>(
            "SELECT * FROM messages WHERE sequence < ? ORDER BY sequence DESC LIMIT 100",
            before ?? Number.MAX_SAFE_INTEGER,
          )
          .toArray()
          .reverse()
          .map((message) => this.withAttachments(message)),
      }
    })
  }

  async append(message: ChatMessage, principal: ChatPrincipal) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const access = await new ChatAccessRepository(this.env.DB).findOne(
        message.channelId,
        principal,
      )
      if (!access || message.memberId !== principal.memberId) return { error: "forbidden" as const }
      const existing = this.ctx.storage.sql
        .exec<MessageRow>("SELECT * FROM messages WHERE id = ?", message.id)
        .toArray()[0]

      if (existing) {
        if (existing.memberId !== message.memberId || existing.text !== message.text)
          return { error: "conflict" as const }
        return { message: this.withAttachments(existing) }
      }
      if (access.archived) return { error: "archived" as const }

      const stored = this.ctx.storage.sql
        .exec<MessageRow>(
          "INSERT INTO messages (id, channelId, memberId, memberName, text, createdAt) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
          message.id,
          message.channelId,
          message.memberId,
          access.memberName,
          message.text,
          Date.now(),
        )
        .one()

      await this.broadcast()
      return { message: this.withAttachments(stored) }
    })
  }

  private withAttachments(message: MessageRow) {
    return {
      ...message,
      attachments: new RoomAttachments(this.ctx.storage.sql).forMessage(message.id),
    }
  }

  async message(channelId: string, principal: ChatPrincipal, id: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!(await new ChatAccessRepository(this.env.DB).findOne(channelId, principal)))
        return { error: "forbidden" as const }
      const message = this.ctx.storage.sql
        .exec<MessageRow>("SELECT * FROM messages WHERE id = ? AND channelId = ?", id, channelId)
        .toArray()[0]
      return message ? { message: this.withAttachments(message) } : { error: "missing" as const }
    })
  }

  async search(
    channelId: string,
    principal: ChatPrincipal,
    q: string,
    before: number | null,
    until: number | null,
  ) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!(await new ChatAccessRepository(this.env.DB).findOne(channelId, principal)))
        return { error: "forbidden" as const }
      const maximum = this.ctx.storage.sql
        .exec<{ maximum: number }>("SELECT COALESCE(MAX(sequence),0) AS maximum FROM messages")
        .one().maximum
      const upper = Math.min(until ?? maximum, maximum)
      const cursor = before ?? Number.MAX_SAFE_INTEGER
      const range = this.ctx.storage.sql
        .exec<{ first: number | null; count: number }>(
          "SELECT MIN(sequence) AS first, COUNT(*) AS count FROM (SELECT sequence FROM messages WHERE channelId = ? AND sequence < ? AND sequence <= ? ORDER BY sequence DESC LIMIT 5000)",
          channelId,
          cursor,
          upper,
        )
        .one()
      const matches =
        range.first === null
          ? []
          : this.ctx.storage.sql
              .exec<MessageRow>(
                "SELECT * FROM messages WHERE channelId = ? AND sequence >= ? AND sequence < ? AND sequence <= ? AND instr(lower(text),lower(?)) > 0 ORDER BY sequence DESC LIMIT 51",
                channelId,
                range.first,
                cursor,
                upper,
                q,
              )
              .toArray()
      const page = matches.slice(0, 50)
      const older =
        range.first !== null &&
        this.ctx.storage.sql
          .exec(
            "SELECT sequence FROM messages WHERE channelId = ? AND sequence < ? LIMIT 1",
            channelId,
            range.first,
          )
          .toArray().length > 0
      const nextBefore = matches.length > 50 ? page.at(-1)!.sequence : older ? range.first : null
      return {
        page: {
          results: page.map((message) => ({
            id: message.id,
            channelId: message.channelId,
            sequence: message.sequence,
            memberName: message.memberName,
            createdAt: message.createdAt,
            snippet: searchSnippet(message.text, q),
          })),
          until: upper,
          nextBefore,
          complete: nextBefore === null,
          windowSize: range.count,
        },
      }
    })
  }

  async upload(channelId: string, principal: ChatPrincipal, input: AttachmentSubmission) {
    const validated = validateAttachment(input)
    if (validated instanceof ChatFailed) return { error: validated.reason }
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", input.data))]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
    return this.ctx.blockConcurrencyWhile(async () => {
      const access = await new ChatAccessRepository(this.env.DB).findOne(channelId, principal)
      if (!access) return { error: "forbidden" as const }
      const attachments = new RoomAttachments(this.ctx.storage.sql)
      const existing = attachments.findOne(channelId, input.id)
      if (existing) {
        if (
          existing.memberId !== principal.memberId ||
          existing.digest !== digest ||
          existing.name !== validated.name ||
          existing.mediaType !== validated.mediaType
        )
          return { error: "conflict" as const }
        return { attachment: attachments.forMessage(existing.messageId)[0]! }
      }
      if (access.archived) return { error: "archived" as const }
      const usage = attachments.usage()
      if (usage.files >= usage.maxFiles || usage.bytes + input.data.byteLength > usage.maxBytes)
        return { error: "capacity" as const }
      if (
        this.ctx.storage.sql.exec("SELECT id FROM messages WHERE id = ?", input.id).toArray().length
      )
        return { error: "conflict" as const }
      const createdAt = Date.now()
      const attachment = this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          "INSERT INTO messages (id,channelId,memberId,memberName,text,createdAt) VALUES (?, ?, ?, ?, ?, ?)",
          input.id,
          channelId,
          principal.memberId,
          access.memberName,
          validated.name,
          createdAt,
        )
        return attachments.create({
          id: input.id,
          channelId,
          messageId: input.id,
          memberId: principal.memberId,
          ...validated,
          size: input.data.byteLength,
          digest,
          data: input.data,
          createdAt,
        })
      })
      await this.broadcast()
      return { attachment }
    })
  }

  async attachments(channelId: string, principal: ChatPrincipal, before: number | null) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!(await new ChatAccessRepository(this.env.DB).findOne(channelId, principal)))
        return { error: "forbidden" as const }
      const rows = new RoomAttachments(this.ctx.storage.sql).findMany(
        channelId,
        before ?? Number.MAX_SAFE_INTEGER,
      )
      const items = rows.slice(0, 50)
      return {
        page: {
          items,
          nextBefore: rows.length > 50 ? items.at(-1)!.sequence : null,
          usage: new RoomAttachments(this.ctx.storage.sql).usage(),
        },
      }
    })
  }

  async attachment(channelId: string, principal: ChatPrincipal, id: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!(await new ChatAccessRepository(this.env.DB).findOne(channelId, principal)))
        return { error: "forbidden" as const }
      const row = new RoomAttachments(this.ctx.storage.sql).findOne(channelId, id)
      if (!row) return { error: "missing" as const }
      return { file: { name: row.name, data: row.data } }
    })
  }

  async rename(channelId: string, principal: ChatPrincipal, name: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const channel = await new ChannelRepository({ database: this.env.DB }).rename(
        principal,
        channelId,
        name,
      )
      if (channel instanceof ChatFailed) return { error: channel.reason }
      await this.broadcast()
      return { channel }
    })
  }

  async setArchived(channelId: string, principal: ChatPrincipal, archived: boolean) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const channel = await new ChannelRepository({ database: this.env.DB }).setArchived(
        principal,
        channelId,
        archived,
      )
      if (channel instanceof ChatFailed) return { error: channel.reason }
      await this.broadcast()
      return { channel }
    })
  }

  private async socketAccess(socket: WebSocket) {
    const attachment: { channelId: string; principal: ChatPrincipal } | null =
      socket.deserializeAttachment()
    return (
      attachment &&
      (await new ChatAccessRepository(this.env.DB).findOne(
        attachment.channelId,
        attachment.principal,
      ))
    )
  }

  private async broadcast() {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (!(await this.socketAccess(socket))) {
          socket.close(1008, "Sign in again")
          continue
        }
        socket.send(JSON.stringify({ type: "changed" }))
      } catch {
        socket.close(1011, "Reconnect")
      }
    }
  }

  async fetch(request: Request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket required", { status: 426 })

    const channelId = request.headers.get("x-chat-channel") ?? ""
    const principal = {
      memberId: request.headers.get("x-chat-member") ?? "",
      sessionHash: request.headers.get("x-chat-session") ?? "",
      kind: request.headers.get("x-chat-kind") ?? "",
    }
    if (!(await new ChatAccessRepository(this.env.DB).findOne(channelId, principal)))
      return new Response("Forbidden", { status: 403 })

    const sockets = new WebSocketPair()

    this.ctx.acceptWebSocket(sockets[1])
    sockets[1].serializeAttachment({ channelId, principal })

    return new Response(null, { status: 101, webSocket: sockets[0] })
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (!(await this.socketAccess(socket))) {
      socket.close(1008, "Sign in again")
      return
    }
    if (message === "ping") socket.send("pong")
    else socket.close(1008, "Read only")
  }

  webSocketClose(socket: WebSocket, code: number) {
    socket.close(code === 1006 ? 1000 : code)
  }
}

export const ChatRoom = defineDurableObject({ name: "chat-room", class: ChatRoomObject })

export default ChatRoom
