import { z } from "zod"

export const invitationDeliverySchema = z.object({
  state: z.enum(["queued", "sending", "sent", "failed", "unknown"]),
  attempts: z.number().int().nonnegative(),
})

export type InvitationDeliveryOutcome = "sent" | "failed" | "unknown"
export const invitationAttemptLimit = 3
export const invitationLeaseMilliseconds = 60_000
export const invitationSendTimeoutMilliseconds = 10_000
