import { z } from "zod"
import { invitationDeliverySchema } from "@/contexts/membership/domain/invitation-delivery"

export const invitationSchema = z.object({
  id: z.string(),
  email: z.email(),
  expiresAt: z.number(),
  status: z.enum(["pending", "expired", "unavailable", "revoked", "accepted"]),
  delivery: invitationDeliverySchema,
})
