import { z } from "zod"

export const memberSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string().min(1).max(80),
  role: z.enum(["owner", "admin", "member"]),
  status: z.enum(["active", "disabled"]),
  createdAt: z.number(),
})

export type Member = z.infer<typeof memberSchema>
