import { Hono } from "hono"
import { z } from "zod"
import { env } from "void/env"
import type { AppEnvironment } from "@/api/app-environment"
import { authenticate } from "@/contexts/identity/interface/authenticate"
import { createSecret } from "@/contexts/identity/infrastructure/adapters/create-secret"
import { hashSecret } from "@/contexts/identity/infrastructure/adapters/hash-secret"
import { SessionRepository } from "@/contexts/identity/infrastructure/repositories/session.repository"

export const deviceRoutes = new Hono<AppEnvironment>()

deviceRoutes.post("/", async (context) => {
  const input = z.object({ name: z.string().trim().min(1).max(80) }).parse(await context.req.json())
  const id = crypto.randomUUID()
  const verifier = createSecret()
  const userCode = crypto
    .getRandomValues(new Uint32Array(1))[0]!
    .toString()
    .slice(-6)
    .padStart(6, "0")
  const expiresAt = Date.now() + 300_000

  await context.env.DB.prepare("DELETE FROM chat_authorization_requests WHERE expires_at <= ?")
    .bind(Date.now())
    .run()
  await context.env.DB.prepare(
    "INSERT INTO chat_authorization_requests (id, verifier_hash, user_code, name, status, expires_at) VALUES (?, ?, ?, ?, 'pending', ?)",
  )
    .bind(id, await hashSecret(verifier), userCode, input.name, expiresAt)
    .run()

  return context.json(
    { id, verifier, userCode, expiresAt, authorizationUrl: `${env.APP_ORIGIN}/?authorize=${id}` },
    201,
  )
})

deviceRoutes.get("/:id", async (context) => {
  const request = await context.env.DB.prepare(
    "SELECT name, status, expires_at AS expiresAt FROM chat_authorization_requests WHERE id = ? AND expires_at > ?",
  )
    .bind(context.req.param("id"), Date.now())
    .first()

  if (!request) return context.json({ error: "承認リクエストは無効または期限切れです" }, 404)

  return context.json(request)
})

deviceRoutes.post("/:id/approve", authenticate, async (context) => {
  if (context.get("sessionKind") !== "browser")
    return context.json({ error: "ブラウザで確認してください" }, 403)

  const recentSession = await context.env.DB.prepare(
    "SELECT hash FROM chat_sessions WHERE hash = ? AND kind = 'browser' AND name = ? AND created_at > ?",
  )
    .bind(context.get("sessionHash"), `device:${context.req.param("id")}`, Date.now() - 120_000)
    .first()

  if (!recentSession) return context.json({ error: "パスキーで本人確認してください" }, 403)

  const input = z
    .object({ code: z.string().length(6), approve: z.boolean() })
    .parse(await context.req.json())
  const update = await context.env.DB.prepare(
    "UPDATE chat_authorization_requests SET status = ?, member_id = ? WHERE id = ? AND user_code = ? AND status = 'pending' AND expires_at > ?",
  )
    .bind(
      input.approve ? "approved" : "denied",
      context.get("member").id,
      context.req.param("id"),
      input.code,
      Date.now(),
    )
    .run()

  if (!update.meta.changes)
    return context.json(
      { error: "承認リクエストは使用済み、期限切れ、またはコードが異なります" },
      409,
    )

  await context.env.DB.prepare(
    "UPDATE chat_sessions SET name = 'Browser' WHERE hash = ? AND name = ?",
  )
    .bind(context.get("sessionHash"), `device:${context.req.param("id")}`)
    .run()

  return context.json({ ok: true })
})

deviceRoutes.post("/:id/poll", async (context) => {
  const input = z.object({ verifier: z.string().length(64) }).parse(await context.req.json())
  const hash = await hashSecret(input.verifier)
  const request = await context.env.DB.prepare(
    "SELECT status FROM chat_authorization_requests WHERE id = ? AND verifier_hash = ? AND expires_at > ?",
  )
    .bind(context.req.param("id"), hash, Date.now())
    .first<{ status: string }>()

  if (!request) return context.json({ error: "承認リクエストは無効または期限切れです" }, 410)

  if (request.status === "pending") return context.json({ status: "pending" })

  const approval = await context.env.DB.prepare(
    "DELETE FROM chat_authorization_requests WHERE id = ? AND verifier_hash = ? AND status != 'pending' AND expires_at > ? RETURNING status, member_id AS memberId, name",
  )
    .bind(context.req.param("id"), hash, Date.now())
    .first<{ status: string; memberId: string; name: string }>()

  if (!approval || approval.status !== "approved")
    return context.json({ error: "承認は拒否または取消されました" }, 403)

  const member = await context.env.DB.prepare(
    "SELECT id FROM chat_members WHERE id = ? AND status = 'active'",
  )
    .bind(approval.memberId)
    .first()

  if (!member) return context.json({ error: "アクセスが停止されています" }, 403)

  const session = await new SessionRepository({ database: context.env.DB }).create(
    approval.memberId,
    "token",
    approval.name,
  )

  return context.json({ status: "approved", token: session.token, expiresAt: session.expiresAt })
})

deviceRoutes.post("/:id/cancel", async (context) => {
  const input = z.object({ verifier: z.string().length(64) }).parse(await context.req.json())

  await context.env.DB.prepare(
    "DELETE FROM chat_authorization_requests WHERE id = ? AND verifier_hash = ?",
  )
    .bind(context.req.param("id"), await hashSecret(input.verifier))
    .run()

  return context.json({ ok: true })
})
