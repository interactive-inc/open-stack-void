import { z } from "zod"

export const registrationClaimSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string().trim().min(1).max(80),
  role: z.enum(["owner", "member"]),
  inviteHash: z.string().nullable(),
  existing: z.boolean(),
  sessionHash: z.string().nullable(),
})

export type RegistrationClaim = z.infer<typeof registrationClaimSchema>
