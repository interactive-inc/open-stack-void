import { sendEmail } from "void/email"
import type { InvitationDeliveryOutcome } from "@/contexts/membership/domain/invitation-delivery"

const rejectedCodes = new Set([
  "BINDING_MISSING",
  "INVALID_FROM",
  "INVALID_TO",
  "UNVERIFIED_DESTINATION",
  "MIME_ERROR",
  "QUOTA_EXCEEDED",
  "IDEMPOTENCY_CONFLICT",
  "UPSTREAM_ERROR",
])

export class InvitationMailAdapter {
  // The current native Cloudflare binding cannot deduplicate. Enable only for a
  // separately verified Void Platform integration, never as an automatic fallback.
  constructor(private readonly supportsIdempotency = false) {}

  async send(email: string, link: string, key: string): Promise<InvitationDeliveryOutcome> {
    const delivery = await sendEmail({
      to: email,
      subject: "Void Chat への招待",
      text: `Void Chat に招待されました。次のリンクからパスキーを登録してください。招待は7日間有効です。\n\n${link}`,
      ...(this.supportsIdempotency ? { idempotencyKey: key } : {}),
    })

    if (!delivery.ok) {
      const codes =
        "error" in delivery
          ? [delivery.error.code]
          : delivery.deliveries.filter((item) => !item.ok).map((item) => item.error.code)
      return codes.length && codes.every((code) => rejectedCodes.has(code)) ? "failed" : "unknown"
    }

    return "sent"
  }
}
