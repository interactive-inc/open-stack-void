import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "@/api/app-environment"
import { authenticate } from "@/contexts/identity/interface/authenticate"
import { SessionRepository } from "@/contexts/identity/infrastructure/repositories/session.repository"
import { confirmation } from "@/contexts/identity/interface/confirmation"

export const accountRoutes = new Hono<AppEnvironment>()

accountRoutes.use("*", authenticate)

accountRoutes.get("/me", (context) => context.json(context.get("member")))

accountRoutes.get("/tokens", async (context) => {
  const tokens = await context.env.DB.prepare(
    "SELECT hash AS id, name, expires_at AS expiresAt, created_at AS createdAt FROM chat_sessions WHERE member_id = ? AND kind = 'token' AND expires_at > ? ORDER BY created_at DESC",
  )
    .bind(context.get("member").id, Date.now())
    .all()

  return context.json(tokens.results)
})

accountRoutes.post("/tokens", confirmation("issue-token"), async (context) => {
  if (context.get("sessionKind") !== "browser")
    return context.json({ error: "ブラウザで発行してください" }, 403)

  const input = z.object({ name: z.string().trim().min(1).max(80) }).parse(await context.req.json())
  const token = await new SessionRepository({ database: context.env.DB }).create(
    context.get("member").id,
    "token",
    input.name,
  )

  return context.json({ token: token.token, expiresAt: token.expiresAt }, 201)
})

accountRoutes.delete("/tokens/:id", async (context) => {
  await context.env.DB.prepare(
    "DELETE FROM chat_sessions WHERE hash = ? AND member_id = ? AND kind = 'token'",
  )
    .bind(context.req.param("id"), context.get("member").id)
    .run()

  return context.json({ ok: true })
})

accountRoutes.get("/passkeys", async (context) => {
  const passkeys = await context.env.DB.prepare(
    "SELECT id, name, created_at AS createdAt FROM chat_credentials WHERE member_id = ? ORDER BY created_at",
  )
    .bind(context.get("member").id)
    .all()

  return context.json(passkeys.results)
})

accountRoutes.delete(
  "/passkeys/:id",
  confirmation((context) => `delete-passkey:${context.req.param("id")}`),
  async (context) => {
    if (context.get("sessionKind") !== "browser")
      return context.json({ error: "ブラウザで操作してください" }, 403)

    const deletion = await context.env.DB.prepare(
      "DELETE FROM chat_credentials WHERE id = ? AND member_id = ? AND (SELECT COUNT(*) FROM chat_credentials WHERE member_id = ?) > 1",
    )
      .bind(context.req.param("id"), context.get("member").id, context.get("member").id)
      .run()

    if (!deletion.meta.changes)
      return context.json({ error: "最後のパスキーは削除できません" }, 409)

    return context.json({ ok: true })
  },
)
