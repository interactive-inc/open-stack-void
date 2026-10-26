import { z } from "zod"

export const channelNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/)
export const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  archived: z
    .union([z.boolean(), z.literal(0), z.literal(1)])
    .transform((value) => value === true || value === 1),
})
