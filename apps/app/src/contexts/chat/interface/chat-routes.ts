import { Hono } from "hono"
import { z } from "zod"
import { env } from "void/env"
import type { AppEnvironment } from "@/api/app-environment"
import { authenticate } from "@/contexts/identity/interface/authenticate"
import { ChannelRepository } from "@/contexts/chat/infrastructure/repositories/channel.repository"
import { MessageRepository } from "@/contexts/chat/infrastructure/repositories/message.repository"
import { SendMessage } from "@/contexts/chat/application/send-message"
import { ChatRoom } from "@app/durable-objects/chat-room"

export const chatRoutes = new Hono<AppEnvironment>()

chatRoutes.use("*", authenticate)

chatRoutes.get("/channels", async (context) =>
  context.json(await new ChannelRepository({ database: context.env.DB }).findMany()),
)

chatRoutes.post("/channels", async (context) => {
  if (context.get("member").role === "member")
    return context.json({ error: "管理者権限が必要です" }, 403)

  const input = z
    .object({
      name: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    })
    .parse(await context.req.json())
  const channel = await new ChannelRepository({ database: context.env.DB })
    .create(input.name, context.get("member").id)
    .catch(() => null)

  if (!channel) return context.json({ error: "このチャンネル名は使用されています" }, 409)

  return context.json(channel, 201)
})

chatRoutes.get("/channels/:channel/messages", async (context) => {
  const channel = await new ChannelRepository({ database: context.env.DB }).findOne(
    context.req.param("channel"),
  )

  if (!channel) return context.json({ error: "チャンネルが見つかりません" }, 404)

  const before = z.coerce.number().int().positive().optional().parse(context.req.query("before"))

  return context.json(await new MessageRepository().findMany(channel.id, before ?? null))
})

chatRoutes.post("/channels/:channel/messages", async (context) => {
  const input = z
    .object({ id: z.string().uuid(), text: z.string().trim().min(1).max(4000) })
    .parse(await context.req.json())
  const message = await new SendMessage({
    channels: new ChannelRepository({ database: context.env.DB }),
    messages: new MessageRepository(),
  }).execute(context.get("member"), { ...input, channelId: context.req.param("channel") })

  if (message instanceof Error) return context.json({ error: message.message }, 409)

  return context.json(message, 201)
})

chatRoutes.get("/channels/:channel/socket", async (context) => {
  if (context.req.header("origin") !== env.APP_ORIGIN)
    return context.json({ error: "許可されていない接続です" }, 403)

  const channel = await new ChannelRepository({ database: context.env.DB }).findOne(
    context.req.param("channel"),
  )

  if (!channel) return context.json({ error: "チャンネルが見つかりません" }, 404)

  return ChatRoom.get(channel.id).fetch(context.req.raw)
})
