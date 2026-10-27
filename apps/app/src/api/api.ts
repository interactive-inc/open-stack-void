import { Hono } from "hono"
import { bodyBudget } from "@/api/body-budget"
import { limitBody } from "@/api/limit-body"
import { env } from "void/env"
import { z } from "zod"
import type { AppEnvironment } from "@/api/app-environment"
import { registrationRoutes } from "@/contexts/identity/interface/registration-routes"
import { loginRoutes } from "@/contexts/identity/interface/login-routes"
import { accountRoutes } from "@/contexts/identity/interface/account-routes"
import { membershipRoutes } from "@/contexts/membership/interface/membership-routes"
import { contentRoutes } from "@/contexts/chat/interface/content-routes"
import { attachmentLimit } from "@/contexts/chat/domain/attachment-limits"
import { chatRoutes } from "@/contexts/chat/interface/chat-routes"
import { AuthGate } from "@app/durable-objects/auth-gate"
import { deviceRoutes } from "@/contexts/identity/interface/device-routes"
import { reauthenticationRoutes } from "@/contexts/identity/interface/reauthentication-routes"

export const api = new Hono<AppEnvironment>().basePath("/api")

api.use("*", (context, next) =>
  limitBody(bodyBudget(context.req.method, context.req.path, attachmentLimit))(context, next),
)

api.use("*", async (context, next) => {
  context.header("X-Robots-Tag", "noindex")
  context.header("Cache-Control", "no-store")
  context.header("X-Content-Type-Options", "nosniff")
  context.header("Referrer-Policy", "no-referrer")

  const isDeviceClient =
    /^\/api\/device(?:\/[^/]+\/(?:poll|cancel))?\/?$/.test(context.req.path) &&
    !context.req.header("cookie")

  if (
    !["GET", "HEAD"].includes(context.req.method) &&
    !isDeviceClient &&
    !/^Bearer [a-f0-9]{64}$/.test(context.req.header("authorization") ?? "") &&
    context.req.header("origin") !== env.APP_ORIGIN
  )
    return context.json({ error: "許可されていないリクエストです" }, 403)

  return next()
})

api.use("*", async (context, next) => {
  if (!context.req.path.startsWith("/api/auth/") && !context.req.path.startsWith("/api/device"))
    return next()

  const ip = context.req.header("cf-connecting-ip") ?? "local"
  const allowed = await AuthGate.get(ip).allow()

  if (!allowed)
    return context.json({ error: "しばらく待ってから再試行してください" }, 429, {
      "Retry-After": "60",
    })

  return next()
})

api.get("/health", (context) => context.json({ ok: true, service: "void-chat" }))
api.route("/auth", registrationRoutes)
api.route("/auth", loginRoutes)
api.route("/auth", reauthenticationRoutes)
api.route("/device", deviceRoutes)
api.route("/", accountRoutes)
api.route("/", membershipRoutes)
api.route("/", contentRoutes)
api.route("/", chatRoutes)

api.onError((error, context) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return context.json({ error: "入力を確認してください" }, 400)

  console.error(error.message)

  return context.json({ error: "処理に失敗しました。再試行してください" }, 500)
})

api.notFound((context) => context.json({ error: "見つかりません" }, 404))
