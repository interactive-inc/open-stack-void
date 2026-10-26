import { z } from "zod"

export const invitationSchema = z.object({
  id: z.string(),
  email: z.email(),
  expiresAt: z.number(),
  status: z.enum(["pending", "expired", "unavailable", "revoked", "accepted"]),
})
