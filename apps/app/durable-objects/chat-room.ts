import { DurableObject } from "cloudflare:workers"
import { defineDurableObject } from "void/durable"
import type { ChatMessage } from "@/contexts/chat/domain/chat-message"
import type { ChatPrincipal } from "@/contexts/chat/domain/chat-principal"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import { ChatAccessRepository } from "@/contexts/chat/infrastructure/repositories/chat-access.repository"
import { ChannelRepository } from "@/contexts/chat/infrastructure/repositories/channel.repository"

class ChatRoomObject extends DurableObject<{ DB: D1Database }> {
  constructor(state: DurableObjectState, bindings: { DB: D1Database }) {
    super(state, bindings)
    state.setWebSocketAutoResponse()

    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, channelId TEXT NOT NULL, memberId TEXT NOT NULL, memberName TEXT NOT NULL, text TEXT NOT NULL, createdAt INTEGER NOT NULL)",
    )
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
            .exec<ChatMessage>(
              "SELECT * FROM messages WHERE sequence > ? AND sequence <= ? ORDER BY sequence LIMIT 100",
              after,
              until ?? Number.MAX_SAFE_INTEGER,
            )
            .toArray(),
        }
      return {
        messages: this.ctx.storage.sql
          .exec<ChatMessage>(
            "SELECT * FROM messages WHERE sequence < ? ORDER BY sequence DESC LIMIT 100",
            before ?? Number.MAX_SAFE_INTEGER,
          )
          .toArray()
          .reverse(),
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
        .exec<ChatMessage>("SELECT * FROM messages WHERE id = ?", message.id)
        .toArray()[0]

      if (existing) {
        if (existing.memberId !== message.memberId || existing.text !== message.text)
          return { error: "conflict" as const }
        return { message: existing }
      }
      if (access.archived) return { error: "archived" as const }

      const stored = this.ctx.storage.sql
        .exec<ChatMessage>(
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
      return { message: stored }
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
