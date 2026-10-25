import { createMiddleware } from "hono/factory"
import type { Context } from "hono"
import type { AppEnvironment } from "@/api/app-environment"

export function confirmation(purpose: string | ((context: Context<AppEnvironment>) => string)) {
  return createMiddleware<AppEnvironment>(async (context, next) => {
    const operation = typeof purpose === "string" ? purpose : purpose(context)
    const confirmed = await context.env.DB.prepare(
      "UPDATE chat_sessions SET name = 'Browser' WHERE hash = ? AND kind = 'browser' AND name = ? AND created_at > ? RETURNING hash",
    )
      .bind(context.get("sessionHash"), operation, Date.now() - 120_000)
      .first()

    if (!confirmed) return context.json({ error: "この操作をパスキーで確認してください" }, 403)

    return next()
  })
}
