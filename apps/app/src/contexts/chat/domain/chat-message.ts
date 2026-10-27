import { z } from "zod"
import { attachmentSchema } from "@/contexts/chat/domain/attachment"

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string(),
  memberId: z.string(),
  memberName: z.string(),
  text: z.string().trim().min(1).max(4000),
  createdAt: z.number(),
  sequence: z.number().int().nonnegative().default(0),
  attachments: attachmentSchema.array().default([]),
  revision: z.number().int().nonnegative().default(0),
  editedAt: z.number().nullable().default(null),
  deletedAt: z.number().nullable().default(null),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>
