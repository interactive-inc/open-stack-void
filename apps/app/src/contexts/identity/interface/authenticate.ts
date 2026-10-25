import { createMiddleware } from "hono/factory"
import { getCookie } from "hono/cookie"
import type { AppEnvironment } from "@/api/app-environment"
import { SessionRepository } from "@/contexts/identity/infrastructure/repositories/session.repository"
import { MemberRepository } from "@/contexts/membership/infrastructure/repositories/member.repository"

export const authenticate = createMiddleware<AppEnvironment>(async (context, next) => {
  const bearer = context.req.header("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]

  if (context.req.header("authorization") && !bearer)
    return context.json({ error: "トークンが無効です" }, 401)

  const token = bearer ?? getCookie(context, "void_chat_session")

  if (!token) return context.json({ error: "ログインしてください" }, 401)

  const session = await new SessionRepository({ database: context.env.DB }).findOne(
    token,
    bearer ? "token" : "browser",
  )

  if (!session) return context.json({ error: "ログインの有効期限が切れました" }, 401)

  const member = await new MemberRepository({ database: context.env.DB }).findOne(session.memberId)

  if (!member || member.status !== "active")
    return context.json({ error: "アクセスが停止されています" }, 403)

  context.set("member", member)
  context.set("sessionHash", session.hash)
  context.set("sessionKind", session.kind)

  return next()
})
