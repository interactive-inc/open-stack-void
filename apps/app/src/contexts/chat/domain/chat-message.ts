import { z } from "zod"

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string(),
  memberId: z.string(),
  memberName: z.string(),
  text: z.string().trim().min(1).max(4000),
  createdAt: z.number(),
  sequence: z.number().int().nonnegative().default(0),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>
