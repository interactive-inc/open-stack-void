import type { Context } from "hono"
import type { AppEnvironment } from "@/api/app-environment"
import { ChatFailed } from "@/contexts/chat/domain/chat-failed"

export function chatPrincipal(context: Context<AppEnvironment>) {
  return {
    memberId: context.get("member").id,
    sessionHash: context.get("sessionHash"),
    kind: context.get("sessionKind"),
  }
}
export function chatFailure(context: Context<AppEnvironment>, failure: ChatFailed) {
  const status =
    failure.reason === "forbidden"
      ? 403
      : failure.reason === "missing"
        ? 404
        : failure.reason === "invalid"
          ? 400
          : failure.reason === "too-large"
            ? 413
            : 409
  return context.json({ error: failure.message }, status)
}
