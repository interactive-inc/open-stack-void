import { ChannelActivityRepository } from "@/contexts/chat/infrastructure/repositories/channel-activity.repository"
import { MarkChannelRead } from "@/contexts/chat/application/mark-channel-read"
import { EditMessage } from "@/contexts/chat/application/edit-message"
import { DeleteMessage } from "@/contexts/chat/application/delete-message"
import { MessageChangeError } from "@/contexts/chat/domain/message-change-error"
import { Hono } from "hono"
import { z } from "zod"
import { env } from "void/env"
import type { AppEnvironment } from "@/api/app-environment"
import { authenticate } from "@/contexts/identity/interface/authenticate"
import { ChannelRepository } from "@/contexts/chat/infrastructure/repositories/channel.repository"
import { MessageRepository } from "@/contexts/chat/infrastructure/repositories/message.repository"
import { SendMessage } from "@/contexts/chat/application/send-message"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import { CreateChannel } from "@/contexts/chat/application/create-channel"
import { RenameChannel } from "@/contexts/chat/application/rename-channel"
import { SetChannelArchive } from "@/contexts/chat/application/set-channel-archive"
import { ChannelControlRepository } from "@/contexts/chat/infrastructure/repositories/channel-control.repository"
import {
  chatPrincipal as principal,
  chatFailure as failure,
} from "@/contexts/chat/interface/chat-http"
import { ChatRoom } from "@app/durable-objects/chat-room"

export const chatRoutes = new Hono<AppEnvironment>()

chatRoutes.use("*", authenticate)

chatRoutes.get("/channels", async (context) =>
  context.json(await new ChannelRepository({ database: context.env.DB }).findMany()),
)

chatRoutes.post("/channel-activity", async (context) => {
  const input = z
    .object({ channelIds: z.array(z.string().min(1).max(100)).max(50) })
    .strict()
    .parse(await context.req.json())
  const repository = new ChannelActivityRepository()
  const result = []
  for (const id of new Set(input.channelIds)) {
    const activity = await repository.findOne(id, principal(context))
    if (activity instanceof ChatFailed) return failure(context, activity)
    result.push(activity)
  }
  return context.json(result)
})
chatRoutes.post("/channels/:channel/read", async (context) => {
  const input = z
    .object({ sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) })
    .strict()
    .parse(await context.req.json())
  const result = await new MarkChannelRead(new ChannelActivityRepository()).execute(
    context.get("member"),
    principal(context),
    context.req.param("channel"),
    input.sequence,
  )
  return result instanceof ChatFailed ? failure(context, result) : context.json(result)
})

chatRoutes.post("/channels", async (context) => {
  const input = z
    .object({ id: z.uuid().default(() => crypto.randomUUID()), name: z.string() })
    .strict()
    .parse(await context.req.json())
  const result = await new CreateChannel(
    new ChannelRepository({ database: context.env.DB }),
  ).execute(context.get("member"), principal(context), input)
  return result instanceof ChatFailed ? failure(context, result) : context.json(result, 201)
})
chatRoutes.patch("/channels/:channel", async (context) => {
  const input = z
    .object({ name: z.string() })
    .strict()
    .parse(await context.req.json())
  const channel = await new ChannelRepository({ database: context.env.DB }).findOne(
    context.req.param("channel"),
  )
  if (!channel) return failure(context, new ChatFailed("missing"))
  const result = await new RenameChannel(new ChannelControlRepository()).execute(
    context.get("member"),
    principal(context),
    channel.id,
    input.name,
  )
  return result instanceof ChatFailed ? failure(context, result) : context.json(result)
})
chatRoutes.patch("/channels/:channel/archive", async (context) => {
  const input = z
    .object({ archived: z.boolean() })
    .strict()
    .parse(await context.req.json())
  const channel = await new ChannelRepository({ database: context.env.DB }).findOne(
    context.req.param("channel"),
  )
  if (!channel) return failure(context, new ChatFailed("missing"))
  const result = await new SetChannelArchive(new ChannelControlRepository()).execute(
    context.get("member"),
    principal(context),
    channel.id,
    input.archived,
  )
  return result instanceof ChatFailed ? failure(context, result) : context.json(result)
})

chatRoutes.get("/channels/:channel/messages", async (context) => {
  const channel = await new ChannelRepository({ database: context.env.DB }).findOne(
    context.req.param("channel"),
  )

  if (!channel) return context.json({ error: "チャンネルが見つかりません" }, 404)

  const cursors = z
    .object({
      before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
      after: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
      until: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    })
    .refine((value) => !(value.before !== undefined && value.after !== undefined))
    .refine(
      (value) =>
        value.until === undefined || (value.after !== undefined && value.until >= value.after),
    )
    .parse(context.req.query())
  const result = await new MessageRepository().findMany(
    channel.id,
    principal(context),
    cursors.before ?? null,
    cursors.after ?? null,
    cursors.until ?? null,
  )
  return result instanceof ChatFailed ? failure(context, result) : context.json(result)
})

chatRoutes.patch("/channels/:channel/messages/:message", async (context) => {
  const input = z
    .object({ text: z.string().trim().min(1).max(4000), revision: z.number().int().nonnegative() })
    .parse(await context.req.json())
  const message = await new EditMessage({
    channels: new ChannelRepository({ database: context.env.DB }),
    messages: new MessageRepository(),
    principal: principal(context),
  }).execute(context.get("member"), {
    ...input,
    channelId: context.req.param("channel"),
    id: z.string().uuid().parse(context.req.param("message")),
  })

  if (message instanceof MessageChangeError)
    return context.json({ error: message.message }, message.status)
  return context.json(message)
})

chatRoutes.delete("/channels/:channel/messages/:message", async (context) => {
  const input = z
    .object({ revision: z.number().int().nonnegative() })
    .parse(await context.req.json())
  const message = await new DeleteMessage({
    channels: new ChannelRepository({ database: context.env.DB }),
    messages: new MessageRepository(),
    principal: principal(context),
  }).execute(context.get("member"), {
    ...input,
    channelId: context.req.param("channel"),
    id: z.string().uuid().parse(context.req.param("message")),
  })

  if (message instanceof MessageChangeError)
    return context.json({ error: message.message }, message.status)
  return context.json(message)
})

chatRoutes.post("/channels/:channel/messages", async (context) => {
  const input = z
    .object({
      id: z.string().uuid(),
      text: z.string().trim().min(1).max(4000),
      replyToId: z.uuid().nullable().default(null),
    })
    .parse(await context.req.json())
  const message = await new SendMessage({
    channels: new ChannelRepository({ database: context.env.DB }),
    messages: new MessageRepository(),
    principal: principal(context),
  }).execute(context.get("member"), { ...input, channelId: context.req.param("channel") })

  if (message instanceof ChatFailed) return failure(context, message)

  return context.json(message, 201)
})

chatRoutes.get("/channels/:channel/socket", async (context) => {
  if (context.req.header("origin") !== env.APP_ORIGIN)
    return context.json({ error: "許可されていない接続です" }, 403)

  const channel = await new ChannelRepository({ database: context.env.DB }).findOne(
    context.req.param("channel"),
  )

  if (!channel) return context.json({ error: "チャンネルが見つかりません" }, 404)

  const headers = new Headers(context.req.raw.headers)
  headers.delete("cookie")
  headers.delete("authorization")
  headers.set("x-chat-channel", channel.id)
  headers.set("x-chat-member", context.get("member").id)
  headers.set("x-chat-session", context.get("sessionHash"))
  headers.set("x-chat-kind", context.get("sessionKind"))
  return ChatRoom.get(channel.id).fetch(new Request(context.req.raw, { headers }))
})
