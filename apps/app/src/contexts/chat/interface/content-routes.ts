import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "@/api/app-environment"
import { authenticate } from "@/contexts/identity/interface/authenticate"
import { ChannelRepository } from "@/contexts/chat/infrastructure/repositories/channel.repository"
import { MessageRepository } from "@/contexts/chat/infrastructure/repositories/message.repository"
import { AttachmentRepository } from "@/contexts/chat/infrastructure/repositories/attachment.repository"
import { UploadAttachment } from "@/contexts/chat/application/upload-attachment"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"
import { attachmentLimit } from "@/contexts/chat/domain/attachment-limits"
import { searchInputSchema } from "@/contexts/chat/domain/search"
import { chatPrincipal, chatFailure } from "@/contexts/chat/interface/chat-http"

export const contentRoutes = new Hono<AppEnvironment>()
contentRoutes.use("/channels/:channel/*", authenticate)
contentRoutes.use("/channels/:channel/*", async (context, next) => {
  const channel = await new ChannelRepository({ database: context.env.DB }).findOne(
    context.req.param("channel"),
  )
  if (!channel) return chatFailure(context, new ChatFailed("missing"))
  return next()
})
contentRoutes.post("/channels/:channel/search", async (context) => {
  if (new URL(context.req.url).search) return chatFailure(context, new ChatFailed("invalid"))
  const input = searchInputSchema.parse(await context.req.json())
  const result = await new MessageRepository().search(
    context.req.param("channel"),
    chatPrincipal(context),
    input.q,
    input.before ?? null,
    input.until ?? null,
  )
  return result instanceof ChatFailed ? chatFailure(context, result) : context.json(result)
})
contentRoutes.get("/channels/:channel/messages/:message", async (context) => {
  if (new URL(context.req.url).search) return chatFailure(context, new ChatFailed("invalid"))
  const id = z.uuid().parse(context.req.param("message"))
  const result = await new MessageRepository().findOne(
    context.req.param("channel"),
    chatPrincipal(context),
    id,
  )
  return result instanceof ChatFailed ? chatFailure(context, result) : context.json(result)
})
contentRoutes.post("/channels/:channel/attachments", async (context) => {
  if (new URL(context.req.url).search) return chatFailure(context, new ChatFailed("invalid"))
  const form = await context.req.formData()
  if ([...form.keys()].length !== 2 || !form.has("id") || !form.has("file"))
    return chatFailure(context, new ChatFailed("invalid"))
  const id = z.uuid().parse(form.get("id"))
  const file = form.get("file")
  if (!(file instanceof File)) return chatFailure(context, new ChatFailed("invalid"))
  if (file.size > attachmentLimit) return chatFailure(context, new ChatFailed("too-large"))
  const result = await new UploadAttachment(new AttachmentRepository()).execute(
    context.get("member"),
    chatPrincipal(context),
    context.req.param("channel"),
    {
      id,
      name: file.name,
      mediaType: file.type,
      data: await file.arrayBuffer(),
    },
  )
  return result instanceof ChatFailed ? chatFailure(context, result) : context.json(result, 201)
})
contentRoutes.get("/channels/:channel/attachments", async (context) => {
  const input = z
    .object({ before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() })
    .strict()
    .parse(context.req.query())
  const result = await new AttachmentRepository().findMany(
    context.req.param("channel"),
    chatPrincipal(context),
    input.before ?? null,
  )
  return result instanceof ChatFailed ? chatFailure(context, result) : context.json(result)
})
contentRoutes.get("/channels/:channel/attachments/:attachment", async (context) => {
  if (new URL(context.req.url).search) return chatFailure(context, new ChatFailed("invalid"))
  const id = z.uuid().parse(context.req.param("attachment"))
  const result = await new AttachmentRepository().findOne(
    context.req.param("channel"),
    chatPrincipal(context),
    id,
  )
  if (result instanceof ChatFailed) return chatFailure(context, result)
  return new Response(result.data, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(result.name).replaceAll("'", "%27")}`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  })
})
