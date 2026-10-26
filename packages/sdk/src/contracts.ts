import { z } from "zod"

export const memberSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(["owner", "admin", "member"]),
  status: z.enum(["active", "disabled"]),
  createdAt: z.number(),
})
export const channelSchema = z.object({ id: z.string(), name: z.string() })
export const messageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  memberId: z.string(),
  memberName: z.string(),
  text: z.string(),
  createdAt: z.number(),
  sequence: z.number(),
})
export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  expiresAt: z.number(),
  status: z.enum(["pending", "expired", "unavailable", "revoked", "accepted"]).default("pending"),
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
