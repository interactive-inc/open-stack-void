import { z } from "zod"

export const memberSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(["owner", "admin", "member"]),
  status: z.enum(["active", "disabled"]),
  createdAt: z.number(),
})
export const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  archived: z.boolean().default(false),
})
export const attachmentSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  messageId: z.string(),
  memberId: z.string(),
  name: z.string(),
  mediaType: z.string(),
  size: z.number(),
  sequence: z.number(),
  createdAt: z.number(),
})
export const attachmentPageSchema = z.object({
  items: attachmentSchema.array(),
  nextBefore: z.number().nullable(),
  usage: z.object({
    files: z.number(),
    bytes: z.number(),
    maxFiles: z.number(),
    maxBytes: z.number(),
  }),
})
export const searchPageSchema = z.object({
  results: z
    .object({
      id: z.string(),
      channelId: z.string(),
      sequence: z.number(),
      memberName: z.string(),
      createdAt: z.number(),
      snippet: z.string(),
    })
    .array(),
  nextBefore: z.number().nullable(),
  until: z.number(),
  complete: z.boolean(),
  windowSize: z.number(),
})
export const messageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  memberId: z.string(),
  memberName: z.string(),
  text: z.string(),
  createdAt: z.number(),
  sequence: z.number(),
  attachments: attachmentSchema.array().default([]),
  revision: z.number().int().nonnegative().default(0),
  editedAt: z.number().nullable().default(null),
  deletedAt: z.number().nullable().default(null),
})
export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  expiresAt: z.number(),
  status: z.enum(["pending", "expired", "unavailable", "revoked", "accepted"]).default("pending"),
  delivery: z.object({
    state: z.enum(["queued", "sending", "sent", "failed", "unknown"]),
    attempts: z.number().int().nonnegative(),
  }),
})
export const tokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  expiresAt: z.number(),
  createdAt: z.number(),
})
export const passkeySchema = z.object({ id: z.string(), name: z.string(), createdAt: z.number() })
export const issuedTokenSchema = z.object({ token: z.string(), expiresAt: z.number() })
export const successSchema = z.object({ ok: z.boolean() })

export type Member = z.infer<typeof memberSchema>
export type Channel = z.infer<typeof channelSchema>
export type Message = z.infer<typeof messageSchema>
export type Attachment = z.infer<typeof attachmentSchema>
