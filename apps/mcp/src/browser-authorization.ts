import { nodeFetch } from "@open-stack/sdk/node-fetch"
import { z } from "zod"

type Context = { baseUrl: string; token: string | null }
type Pending = { id: string; verifier: string }

export class BrowserAuthorization {
  private pending: Pending | null = null

  constructor(private readonly context: Context) {}

  async begin() {
    if (this.pending) await this.cancel()

    const response = await nodeFetch(`${this.context.baseUrl}/api/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "MCP" }),
    })

    if (!response.ok) throw new Error("ブラウザ認証を開始できませんでした")

    const request = z
      .object({
        id: z.string(),
        verifier: z.string(),
        userCode: z.string(),
        authorizationUrl: z.string(),
        expiresAt: z.number(),
      })
      .parse(await response.json())

    this.pending = { id: request.id, verifier: request.verifier }

    return {
      authorizationUrl: request.authorizationUrl,
      confirmationCode: request.userCode,
      expiresAt: request.expiresAt,
    }
  }

  async complete() {
    if (!this.pending) throw new Error("begin_login からブラウザ認証を開始してください")

    const response = await nodeFetch(`${this.context.baseUrl}/api/device/${this.pending.id}/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verifier: this.pending.verifier }),
    })

    if (!response.ok) {
      this.pending = null
      throw new Error("認証が拒否・取消・期限切れになりました。再度開始してください")
    }

    const approval = z
      .discriminatedUnion("status", [
        z.object({ status: z.literal("pending") }),
        z.object({ status: z.literal("approved"), token: z.string(), expiresAt: z.number() }),
      ])
      .parse(await response.json())

    if (approval.status === "pending") return { status: "pending" }

    this.context.token = approval.token
    this.pending = null

    return { status: "authenticated", expiresAt: approval.expiresAt }
  }

  async cancel() {
    if (this.pending)
      await nodeFetch(`${this.context.baseUrl}/api/device/${this.pending.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifier: this.pending.verifier }),
      })

    this.pending = null

    return { status: "cancelled" }
  }
}
