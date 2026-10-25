import { DurableObject } from "cloudflare:workers"
import { defineDurableObject } from "void/durable"
import type { ChatMessage } from "@/contexts/chat/domain/chat-message"

class ChatRoomObject extends DurableObject<unknown> {
  constructor(state: DurableObjectState, bindings: unknown) {
    super(state, bindings)

    state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, channelId TEXT NOT NULL, memberId TEXT NOT NULL, memberName TEXT NOT NULL, text TEXT NOT NULL, createdAt INTEGER NOT NULL)",
    )
  }

  async list(before: number | null) {
    const cursor = before ?? Number.MAX_SAFE_INTEGER

    return this.ctx.storage.sql
      .exec<ChatMessage>(
        "SELECT * FROM messages WHERE sequence < ? ORDER BY sequence DESC LIMIT 100",
        cursor,
      )
      .toArray()
      .reverse()
  }

  async append(message: ChatMessage) {
    const existing = this.ctx.storage.sql
      .exec<ChatMessage>("SELECT * FROM messages WHERE id = ?", message.id)
      .toArray()[0]

    if (existing) {
      if (existing.memberId !== message.memberId || existing.text !== message.text)
        return { error: "同じ送信IDに異なる内容が指定されました" }
      return { message: existing }
    }

    const stored = this.ctx.storage.sql
      .exec<ChatMessage>(
        "INSERT INTO messages (id, channelId, memberId, memberName, text, createdAt) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
        message.id,
        message.channelId,
        message.memberId,
        message.memberName,
        message.text,
        message.createdAt,
      )
      .one()

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify({ type: "changed" }))
      } catch {
        socket.close(1011, "Reconnect")
      }
    }

    return { message: stored }
  }

  async fetch(request: Request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket required", { status: 426 })

    const sockets = new WebSocketPair()

    this.ctx.acceptWebSocket(sockets[1])
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))

    return new Response(null, { status: 101, webSocket: sockets[0] })
  }

  webSocketMessage(socket: WebSocket) {
    socket.close(1008, "Read only")
  }

  webSocketClose(socket: WebSocket, code: number) {
    socket.close(code)
  }
}

export const ChatRoom = defineDurableObject({ name: "chat-room", class: ChatRoomObject })

export default ChatRoom
